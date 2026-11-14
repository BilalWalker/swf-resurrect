// Sub-task 10.11: Convert writes Shape_JSON (file names, size, images) and records the Shape_Function limits.
// Validates: Requirements 2.8, 7.9, 9.2
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import type { TagsModel } from '../../src/convert/model';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { parseShapeJson } from '../../template/runtime/shapeJson';

async function fixtureModel(name: string): Promise<TagsModel> {
  const dir = resolve(__dirname, '../fixtures', name);
  const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(dir, 'structure.xml'), 'utf8'));
  return readUnpacked({
    workDir: dir,
    shapesDir: resolve(dir, 'shapes'),
    structureDumpPath: resolve(dir, 'structure.xml'),
    symbolClassPath: resolve(dir, 'symbols.csv'),
    scriptsDir: resolve(dir, 'scripts'),
    header,
    xmlVersion,
  });
}

describe('convertModel writes Shape_JSON', () => {
  it.each(['clickgoto', 'tweendemo'])('%s: shape files, sizes, no images, identical on two runs', async (name) => {
    const model = await fixtureModel(name);
    const a = convertModel(model);
    const b = convertModel(model);

    const ids = Object.entries(a.scene.symbols)
      .filter(([, s]) => s.type === 'shape')
      .map(([k]) => Number(k))
      .sort((x, y) => x - y);
    expect(a.shapeFiles.map((f) => f.fileName)).toEqual(ids.map((id) => `${id}.shape.json`));
    for (const f of a.shapeFiles) {
      expect(() => parseShapeJson(f.content)).not.toThrow();
      const sym = a.scene.symbols[String(parseInt(f.fileName, 10))];
      expect(sym?.type === 'shape' && sym.file === f.fileName).toBe(true);
      if (sym?.type === 'shape') {
        expect(sym.size.width).toBeGreaterThan(0);
        expect(sym.size.height).toBeGreaterThan(0);
      }
    }
    expect(a.imageFiles).toEqual([]);
    // No shape of these fixtures yields a limit.
    expect(a.unsupported.filter((u) => ['gradient-fill', 'bitmap-fill', 'stroke-style'].includes(u.kind) && u.context === undefined)).toEqual([]);

    expect(b.shapeFiles).toEqual(a.shapeFiles);
    expect(b.imageFiles).toEqual(a.imageFiles);
    expect(b.unsupported).toEqual(a.unsupported);
  });

  it('a gradient fill becomes an Unsupported entry gradient-fill with the shape id, and the fill is not drawn', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="9px" height="9px">' +
      '<g transform="matrix(1,0,0,1,0,0)">' +
      '<linearGradient id="gradient1"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient>' +
      '<path d="M0 0 L9 0 9 9 Z" fill="url(#gradient1)"/></g></svg>';
    const model: TagsModel = {
      xmlVersion: { major: 4, minor: 2 },
      header: { widthPx: 100, heightPx: 100, frameRate: 12, frameCount: 1 },
      background: null,
      root: { declaredFrameCount: 1, ops: [{ kind: 'place', depth: 1, characterId: 7, move: false }, { kind: 'showFrame' }] },
      sprites: [],
      declaredShapeIds: [7],
      morphShapeIds: [],
      staticTextIds: [],
      bitmapIds: [],
      shapeAssets: [{ id: 7, svg, origin: { x: 0, y: 0 } }],
      symbolClasses: [],
      classSources: [],
      unsupported: [],
    };
    const r = convertModel(model);
    const limit = r.unsupported.filter((u) => u.kind === 'gradient-fill');
    expect(limit).toHaveLength(1);
    expect(limit[0]?.id).toBe(7);
    expect(parseShapeJson(r.shapeFiles[0]!.content).paths).toEqual([]);
    const sym = r.scene.symbols['7'];
    expect(sym?.type === 'shape' && sym.size).toEqual({ width: 9, height: 9 });
  });
});
