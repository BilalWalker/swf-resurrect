import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { convertStage } from '../../src/convert/writeConverted';
import type { UnpackResult } from '../../src/unpack/unpack';

const fixture = resolve(__dirname, '../fixtures/clickgoto');
const temps: string[] = [];

function setup(): UnpackResult {
  const dir = mkdtempSync(join(tmpdir(), 'swfr-conv-'));
  temps.push(dir);
  cpSync(fixture, dir, { recursive: true });
  const { xmlVersion, header } = readDumpHeader(readFileSync(join(dir, 'structure.xml'), 'utf8'));
  return {
    workDir: dir,
    shapesDir: join(dir, 'shapes'),
    textsDir: join(dir, 'texts'),
    structureDumpPath: join(dir, 'structure.xml'),
    symbolClassPath: join(dir, 'symbols.csv'),
    scriptsDir: join(dir, 'scripts'),
    header,
    xmlVersion,
  };
}

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('convertStage', () => {
  it('writes Shape_JSON files ascending by id and scene.json last, with no temp file left', async () => {
    const artifact = await convertStage(setup());
    const assets = join(artifact.stagingDir, 'assets');
    expect(artifact.shapePaths.map((p) => p.slice(assets.length + 1))).toEqual(['1.shape.json', '2.shape.json', '4.shape.json', '5.shape.json']);
    expect(artifact.scenePath).toBe(join(assets, 'scene.json'));
    expect(readdirSync(assets).sort()).toEqual(['1.shape.json', '2.shape.json', '4.shape.json', '5.shape.json', 'scene.json']);
    expect(artifact.imagePaths).toEqual([]);
    expect(JSON.parse(readFileSync(artifact.scenePath, 'utf8')).symbols).toBeDefined();
  });

  it('writes nothing when conversion fails', async () => {
    const unpacked = setup();
    rmSync(join(unpacked.shapesDir, '4.svg'));
    await expect(convertStage(unpacked)).rejects.toThrow();
    expect(existsSync(join(unpacked.workDir, 'converted', 'assets', 'scene.json'))).toBe(false);
    expect(existsSync(join(unpacked.workDir, 'converted'))).toBe(false);
  });
});
