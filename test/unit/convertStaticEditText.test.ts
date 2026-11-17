import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { parseStructure } from '../../src/convert/ffdecXml';
import type { TagsModel } from '../../src/convert/model';
import type { SpriteSymbol } from '../../template/runtime/scene';

// Excerpt in the shape FFDec 26.4.0 writes for DefineEditTextTag (attribute names seen in the spacer dump).
const dump = (items: string[]): string =>
  [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<swf _xmlExportMajor="4" _xmlExportMinor="2" frameCount="1" frameRate="24.0">',
    '<tags>',
    ...items,
    '<item type="ShowFrameTag"/>',
    '</tags>',
    '</swf>',
  ].join('\n');
const edit = (id: number, flags: string): string => `<item type="DefineEditTextTag" characterID="${id}" ${flags} useOutlines="true"/>`;

// FFDec text SVG with a glyph <use> and a <defs> glyph, like texts/<id>.svg.
const glyphSvg = (w: number, h: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}px" height="${h}px">` +
  '<g transform="matrix(1.0, 0.0, 0.0, 1.0, 2.0, 2.0)"><g transform="matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)">' +
  '<use fill="#808080" transform="matrix(0.05, 0.0, 0.0, 0.05, 0.0, 10.0)" xlink:href="#g0"/></g></g>' +
  '<defs><g id="g0"><path d="M0 0 L100 0 L100 -100 Z"/></g></defs></svg>';

describe('Convert static edit text (as3-coverage 33.2, D12)', () => {
  it('reads a static read-only DefineEditTextTag as static text', () => {
    const s = parseStructure(dump([edit(7, 'wasStatic="true" readOnly="true"')]));
    expect(s.staticTextIds).toEqual([7]);
    expect(s.unsupported).toEqual([]);
  });

  it('keeps an edit text that is not both static and read-only unsupported', () => {
    for (const flags of ['wasStatic="false" readOnly="true"', 'wasStatic="true" readOnly="false"', 'readOnly="true"']) {
      const s = parseStructure(dump([edit(7, flags)]));
      expect(s.staticTextIds, flags).toEqual([]);
      expect(s.unsupported.map((u) => [u.kind, u.characterId]), flags).toEqual([['text', 7]]);
    }
  });

  it('emits a shape symbol and keeps the placement', () => {
    const structure = parseStructure(dump([edit(7, 'wasStatic="true" readOnly="true"')]));
    const model: TagsModel = {
      xmlVersion: { major: 4, minor: 2 },
      header: { widthPx: 100, heightPx: 100, frameRate: 12, frameCount: 1 },
      background: null,
      root: { declaredFrameCount: 1, ops: [{ kind: 'place', depth: 1, characterId: 7, move: false }, { kind: 'showFrame' }] },
      sprites: [],
      declaredShapeIds: [],
      morphShapeIds: [],
      staticTextIds: structure.staticTextIds,
      bitmapIds: [],
      shapeAssets: [],
      textAssets: [{ id: 7, svg: glyphSvg(30, 12), origin: { x: 2, y: 2 } }],
      symbolClasses: [],
      classSources: [],
      unsupported: structure.unsupported,
    };
    const r = convertModel(model);
    expect(r.scene.symbols['7']).toMatchObject({ type: 'shape', file: '7.shape.json', size: { width: 30, height: 12 } });
    expect((r.scene.symbols['0'] as SpriteSymbol).frames[0].map((e) => e.symbolId)).toEqual([7]);
    expect(r.unsupported.filter((u) => u.kind === 'text' && u.context !== undefined)).toEqual([]);
    expect(r.shapeFiles.find((f) => f.fileName === '7.shape.json')?.content).toContain('["M",0,10]');
  });
});
