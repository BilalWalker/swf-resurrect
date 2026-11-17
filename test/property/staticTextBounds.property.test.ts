import fc from 'fast-check';
import { describe, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import type { TagsModel } from '../../src/convert/model';
import type { ShapeSymbol } from '../../template/runtime/scene';

// FFDec text SVG: width/height in px, glyph <use> elements that point into <defs>.
function textSvg(w: number, h: number, glyphs: number): string {
  const uses = Array.from(
    { length: glyphs },
    (_, i) => `<use fill="#808080" transform="matrix(0.05, 0.0, 0.0, 0.05, ${i * 10}.0, 10.0)" xlink:href="#g${i}"/>`,
  ).join('');
  const defs = Array.from({ length: glyphs }, (_, i) => `<g id="g${i}"><path d="M0 0 L100 0 L100 -100 Z"/></g>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}px" height="${h}px">` +
    `<g transform="matrix(1.0, 0.0, 0.0, 1.0, 2.0, 2.0)"><g>${uses}</g></g><defs>${defs}</defs></svg>`
  );
}

describe('static text shape bounds (as3-coverage 33.3)', () => {
  it('the emitted shape symbol size and origin equal the SVG bounds', () => {
    // **Validates: Requirements 29.8**
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: 1, max: 100 }),
        (w, h, glyphs, ox, oy, id) => {
          const model: TagsModel = {
            xmlVersion: { major: 4, minor: 2 },
            header: { widthPx: 100, heightPx: 100, frameRate: 12, frameCount: 1 },
            background: null,
            root: { declaredFrameCount: 1, ops: [{ kind: 'place', depth: 1, characterId: id, move: false }, { kind: 'showFrame' }] },
            sprites: [],
            declaredShapeIds: [],
            morphShapeIds: [],
            staticTextIds: [id],
            bitmapIds: [],
            shapeAssets: [],
            textAssets: [{ id, svg: textSvg(w, h, glyphs), origin: { x: ox, y: oy } }],
            symbolClasses: [],
            classSources: [],
            unsupported: [],
          };
          const sym = convertModel(model).scene.symbols[String(id)] as ShapeSymbol;
          return sym.type === 'shape' && sym.size.width === w && sym.size.height === h && sym.origin.x === ox && sym.origin.y === oy;
        },
      ),
      { numRuns: 100 },
    );
  });
});
