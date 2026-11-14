// Shape bounds come from Scene_JSON `size` and `origin` (sub-task 10.12; replaces src/verify/core/svgBounds.ts).
// Validates: Requirements 12.4, 7.11
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';

describe('Scene_JSON shape size', () => {
  it('clickgoto shape 1 is the SVG width and height in px, with the wrapper translation as origin', async () => {
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
    const sym = convertModel(model).scene.symbols['1'];
    expect(sym?.type).toBe('shape');
    if (sym?.type !== 'shape') return;
    expect(sym.size).toEqual({ width: 85, height: 81 });
    expect(sym.origin).toEqual({ x: 42.5, y: 40.5 });
    // Bounds in shape-origin space: (-origin.x, -origin.y, width, height).
    expect({ x: -sym.origin.x, y: -sym.origin.y, ...sym.size }).toEqual({ x: -42.5, y: -40.5, width: 85, height: 81 });
  });
});
