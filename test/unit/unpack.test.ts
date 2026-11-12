import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { InvalidClassNameError } from '../../src/convert/qualifiedName';
import type { FfdecSpawner } from '../../src/unpack/spawnFfdec';
import { unpack } from '../../src/unpack/unpack';

const root = resolve(__dirname, '..', '..');
const workDirs: string[] = [];

afterAll(async () => {
  for (const d of workDirs) await rm(d, { recursive: true, force: true });
});

describe('unpack (real FFDec)', () => {
  it('unpacks samples/clickgoto/test.swf and reports header values', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'swf-unpack-'));
    workDirs.push(workDir);
    const result = await unpack({
      swfPath: join(root, 'samples', 'clickgoto', 'test.swf'),
      workDir,
      ffdecJarPath: join(root, 'tools', 'ffdec', 'ffdec-cli.jar'),
    });
    expect(result.header).toEqual({ widthPx: 550, heightPx: 400, frameRate: 24, frameCount: 3 });
    expect(result.xmlVersion.major).toBe(4);
    expect(result.shapesDir).toBe(join(workDir, 'shapes'));
  }, 120_000);
});

describe('unpack symbols.csv validation (fake FFDec)', () => {
  async function run(csv: string) {
    const dir = await mkdtemp(join(tmpdir(), 'swf-unpack-csv-'));
    workDirs.push(dir);
    const swf = join(dir, 'in.swf');
    await writeFile(swf, 'FWS\x09rest');
    const jar = join(dir, 'ffdec-cli.jar');
    await writeFile(jar, 'jar');
    const workDir = join(dir, 'work');
    await mkdir(workDir);
    const xml = await readFile(join(root, 'test', 'fixtures', 'clickgoto', 'structure.xml'), 'utf8');
    const spawner: FfdecSpawner = async (req) => {
      if (req.args[0] === '-swf2xml') {
        await writeFile(req.args[2]!, xml);
      } else {
        await mkdir(join(workDir, 'shapes'), { recursive: true });
        await mkdir(join(workDir, 'scripts'), { recursive: true });
        await mkdir(join(workDir, 'symbolClass'), { recursive: true });
        await writeFile(join(workDir, 'symbolClass', 'symbols.csv'), csv);
      }
      return { stdout: '', stderr: '' };
    };
    return unpack({ swfPath: swf, workDir, ffdecJarPath: jar, spawner });
  }

  it('18.1 accepts a dotted class name', async () => {
    const r = await run('0;"MainTimeline"\n3;"fl.controls.Slider"\n');
    expect(r.symbolClassPath).not.toBeNull();
  });

  it('18.2 an invalid name fails at stage unpack', async () => {
    const err = await run('3;"..\\evil.X"\n').catch((e) => e);
    expect(err).toBeInstanceOf(InvalidClassNameError);
    expect(err.stage).toBe('unpack');
  });
});