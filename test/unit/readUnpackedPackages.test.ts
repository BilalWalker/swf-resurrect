import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { InvalidClassNameError } from '../../src/convert/qualifiedName';
import { readUnpacked } from '../../src/convert/readUnpacked';
import type { UnpackResult } from '../../src/unpack/unpack';

const fixture = resolve(__dirname, '../fixtures/clickgoto');
const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

async function setup(csv: string): Promise<{ unpacked: UnpackResult; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'swf-pkgs-'));
  dirs.push(dir);
  await mkdir(join(dir, 'scripts', 'code'), { recursive: true });
  await mkdir(join(dir, 'scripts', 'fl', 'controls'), { recursive: true });
  await writeFile(join(dir, 'scripts', 'code', 'Interactivity3.as'), 'package code { public class Interactivity3 { public var a:int; } }');
  await writeFile(join(dir, 'scripts', 'fl', 'controls', 'Slider.as'), 'package fl.controls { public class Slider { public var b:int; } }');
  await writeFile(join(dir, 'symbols.csv'), csv);
  const { xmlVersion, header } = readDumpHeader(readFileSync(join(fixture, 'structure.xml'), 'utf8'));
  return {
    dir,
    unpacked: {
      workDir: dir,
      shapesDir: join(fixture, 'shapes'),
      structureDumpPath: join(fixture, 'structure.xml'),
      symbolClassPath: join(dir, 'symbols.csv'),
      scriptsDir: join(dir, 'scripts'),
      header,
      xmlVersion,
    },
  };
}

describe('readUnpacked with package-qualified class names', () => {
  it('18.1 reads scripts/<pkg>/<Cls>.as for dotted names and keeps the dotted className', async () => {
    const { unpacked } = await setup('1;"code.Interactivity3"\n2;"fl.controls.Slider"\n3;"fl.controls.Missing"\n');
    const model = await readUnpacked(unpacked);
    expect(model.symbolClasses.map((s) => s.className)).toEqual([
      'code.Interactivity3',
      'fl.controls.Slider',
      'fl.controls.Missing',
    ]);
    const by = new Map(model.classSources.map((c) => [c.className, c.properties]));
    expect(by.get('code.Interactivity3')).not.toBeNull();
    expect(by.get('fl.controls.Slider')).not.toBeNull();
    expect(by.get('fl.controls.Missing')).toBeNull();
  });

  it('18.2 a hostile name throws InvalidClassNameError and reads no file', async () => {
    const { unpacked } = await setup('1;"..\\..\\secret"\n');
    const err = await readUnpacked(unpacked).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidClassNameError);
    expect(err.stage).toBe('convert');
  });

  it('18.2 a name with a ".." segment is rejected', async () => {
    const { unpacked } = await setup('1;"a...b"\n');
    await expect(readUnpacked(unpacked)).rejects.toBeInstanceOf(InvalidClassNameError);
  });
});
