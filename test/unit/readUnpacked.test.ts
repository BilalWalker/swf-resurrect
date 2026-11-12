import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import type { UnpackResult } from '../../src/unpack/unpack';
import { readFileSync } from 'node:fs';

describe('readUnpacked', () => {
  it('builds a TagsModel from the clickgoto fixture directory', async () => {
    const dir = resolve(__dirname, '../fixtures/clickgoto');
    const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(dir, 'structure.xml'), 'utf8'));
    const unpacked: UnpackResult = {
      workDir: dir,
      shapesDir: resolve(dir, 'shapes'),
      structureDumpPath: resolve(dir, 'structure.xml'),
      symbolClassPath: resolve(dir, 'symbols.csv'),
      scriptsDir: resolve(dir, 'scripts'),
      header,
      xmlVersion,
    };
    const model = await readUnpacked(unpacked);
    expect(model.shapeAssets.map((s) => s.id)).toEqual([1, 2, 4, 5]);
    expect(model.shapeAssets.every((s) => s.svg !== null && s.svg !== '' && s.origin !== null)).toBe(true);
    expect(model.classSources.map((c) => c.className).sort()).toEqual(['LeftButton', 'MainTimeline', 'RightButton']);
    expect(model.header.frameCount).toBe(3);
  });

  it('4.4 a null symbolClassPath gives empty symbolClasses and classSources', async () => {
    const dir = resolve(__dirname, '../fixtures/clickgoto');
    const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(dir, 'structure.xml'), 'utf8'));
    const model = await readUnpacked({
      workDir: dir,
      shapesDir: resolve(dir, 'shapes'),
      structureDumpPath: resolve(dir, 'structure.xml'),
      symbolClassPath: null,
      scriptsDir: resolve(dir, 'scripts'),
      header,
      xmlVersion,
    });
    expect(model.symbolClasses).toEqual([]);
    expect(model.classSources).toEqual([]);
  });
});
