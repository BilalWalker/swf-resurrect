import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import type { TagsModel } from '../../src/convert/model';

/** **Validates: Requirements 9.2** */
describe('Convert determinism with static text', () => {
  const svg = (n: number): string =>
    `<svg width="${n}px" height="10px">\r\n<g transform="matrix(1,0,0,1,-1.5,-0.5)"><path d="M0 0 L${n} ${n} L0 ${n} Z" fill="#000000"/></g>\r\n</svg>`;
  const model: TagsModel = {
    xmlVersion: { major: 4, minor: 2 },
    header: { widthPx: 100, heightPx: 100, frameRate: 12, frameCount: 1 },
    background: null,
    root: {
      declaredFrameCount: 1,
      ops: [{ kind: 'place', depth: 1, characterId: 2, move: false }, { kind: 'showFrame' }],
    },
    sprites: [],
    declaredShapeIds: [1],
    morphShapeIds: [],
    staticTextIds: [2, 3],
    bitmapIds: [],
    shapeAssets: [{ id: 1, svg: svg(5), origin: { x: -1.5, y: -0.5 } }],
    textAssets: [
      { id: 3, svg: svg(9), origin: { x: -1.5, y: -0.5 } },
      { id: 2, svg: svg(7), origin: { x: -1.5, y: -0.5 } },
    ],
    symbolClasses: [],
    classSources: [],
    unsupported: [],
  };

  it('gives byte-identical shape files over two runs', () => {
    const a = convertModel(model);
    const b = convertModel(structuredClone(model));
    expect(a.shapeFiles.map((f) => f.fileName)).toEqual(['1.shape.json', '2.shape.json', '3.shape.json']);
    expect(a.shapeFiles).toEqual(b.shapeFiles);
    expect(a.shapeFiles.every((f) => f.content.length > 0 && !f.content.includes('\r'))).toBe(true);
  });
});
