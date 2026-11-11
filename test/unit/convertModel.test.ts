import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { serialiseUnsupported } from '../../src/pipeline/unsupported';
import type { SpriteSymbol } from '../../template/runtime/scene';

describe('convertModel', () => {
  it('converts the Click_Sample model to symbols 0..6 with the expected placements', async () => {
    const dir = resolve(__dirname, '../fixtures/clickgoto');
    const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(dir, 'structure.xml'), 'utf8'));
    const model = await readUnpacked({
      workDir: dir,
      shapesDir: resolve(dir, 'shapes'),
      structureDumpPath: resolve(dir, 'structure.xml'),
      symbolClassPath: resolve(dir, 'symbols.csv'),
      scriptsDir: resolve(dir, 'scripts'),
      header,
      xmlVersion,
    });
    const result = convertModel(model);

    expect(Object.keys(result.scene.symbols).sort()).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(result.svgFiles.map((f) => f.fileName)).toEqual(['1.svg', '2.svg', '4.svg', '5.svg']);
    expect(result.svgFiles.every((f) => !f.content.includes('\r'))).toBe(true);

    const root = result.scene.symbols['0'] as SpriteSymbol;
    expect(root.className).toBe('MainTimeline');
    expect(root.frameCount).toBe(3);
    const entries = root.frames[0];
    const left = entries.find((e) => e.name === 'l_button');
    const right = entries.find((e) => e.name === 'r_button');
    expect([left?.symbolId, left?.matrix[4], left?.matrix[5]]).toEqual([6, 143.5, 270]);
    expect([right?.symbolId, right?.matrix[4], right?.matrix[5]]).toEqual([3, 415, 272.5]);

    expect(result.unsupported.filter((u) => u.kind === 'unbound-instance')).toEqual([]);
    expect(JSON.parse(serialiseUnsupported(result.unsupported)).formatVersion).toBe(1);
  });
});
