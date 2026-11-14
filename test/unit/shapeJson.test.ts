import { describe, expect, it } from 'vitest';
import {
  assertFillDrawn,
  assertShapeDrawn,
  DRAWN_FILLS,
  fillIsDrawn,
  parseShapeJson,
  printShapeJson,
  ShapeJsonError,
  type DrawnFills,
  type Mat6,
  type ShapeFill,
} from '../../template/runtime/shapeJson';

const M: Mat6 = [1, 0, 0, 1, 0, 0];
const solid: ShapeFill = { kind: 'solid', color: '#ff0000', alpha: 1 };
const linear: ShapeFill = {
  kind: 'gradient',
  type: 'linear',
  matrix: M,
  stops: [
    { offset: 0, color: '#000000', alpha: 1 },
    { offset: 1, color: '#ffffff', alpha: 1 },
  ],
  spread: 'pad',
};
const radial: ShapeFill = { ...linear, type: 'radial' } as ShapeFill;
const bitmap: ShapeFill = { kind: 'bitmap', image: 'images/5.png', matrix: M, smooth: true };

describe('DRAWN_FILLS', () => {
  it('draws linear and radial gradients and bitmap fills (11.4): no fill kind is refused by default', () => {
    expect(DRAWN_FILLS).toEqual({ gradientLinear: true, gradientRadial: true, bitmap: true });
  });
});

describe('fillIsDrawn', () => {
  const none: DrawnFills = { gradientLinear: false, gradientRadial: false, bitmap: false };
  const all: DrawnFills = { gradientLinear: true, gradientRadial: true, bitmap: true };

  it('draws a solid fill whatever the capabilities', () => {
    expect(fillIsDrawn(solid, none)).toBe(true);
    expect(fillIsDrawn(solid, all)).toBe(true);
  });

  it('follows gradientLinear for a linear gradient only', () => {
    expect(fillIsDrawn(linear, none)).toBe(false);
    expect(fillIsDrawn(linear, { ...none, gradientLinear: true })).toBe(true);
    expect(fillIsDrawn(linear, { ...none, gradientRadial: true, bitmap: true })).toBe(false);
  });

  it('follows gradientRadial for a radial gradient only', () => {
    expect(fillIsDrawn(radial, none)).toBe(false);
    expect(fillIsDrawn(radial, { ...none, gradientRadial: true })).toBe(true);
    expect(fillIsDrawn(radial, { ...none, gradientLinear: true, bitmap: true })).toBe(false);
  });

  it('follows bitmap for a bitmap fill only', () => {
    expect(fillIsDrawn(bitmap, none)).toBe(false);
    expect(fillIsDrawn(bitmap, { ...none, bitmap: true })).toBe(true);
    expect(fillIsDrawn(bitmap, { ...none, gradientLinear: true, gradientRadial: true })).toBe(false);
  });

  it('draws both gradients and the bitmap under the committed DRAWN_FILLS', () => {
    expect([linear, radial, bitmap].map((f) => fillIsDrawn(f, DRAWN_FILLS))).toEqual([true, true, true]);
  });
});

describe('parseShapeJson', () => {
  it('names the field for a bad document and for text that is not JSON', () => {
    expect(() => parseShapeJson('{')).toThrow(ShapeJsonError);
    expect(() => parseShapeJson('{"formatVersion":1,"paths":[{"contours":[],"fill":null,"stroke":null}]}')).toThrow(
      /^paths\[0\]: needs a fill or a stroke$/,
    );
  });

  it('prints a canonical text and reads it back', () => {
    const shape = {
      formatVersion: 1 as const,
      paths: [{ contours: [{ outer: [['M', -0, 1] as ['M', number, number], ['Z'] as ['Z']], holes: [] }], fill: solid, stroke: null }],
    };
    const text = printShapeJson(shape);
    expect(text).toBe(
      '{"formatVersion":1,"paths":[{"contours":[{"outer":[["M",0,1],["Z"]],"holes":[]}],"fill":{"kind":"solid","color":"#ff0000","alpha":1},"stroke":null}]}',
    );
    expect(printShapeJson(parseShapeJson(text))).toBe(text);
  });
});

describe('assertFillDrawn (the drawFill check, sub-task 10.12)', () => {
  it('does not throw for any fill kind by default, and names the field path and kind under caps that refuse it', () => {
    const none: DrawnFills = { gradientLinear: false, gradientRadial: false, bitmap: false };
    for (const f of [solid, linear, radial, bitmap]) expect(() => assertFillDrawn(f, 'paths[0].fill')).not.toThrow();
    expect(() => assertFillDrawn(bitmap, 'paths[1].fill', none)).toThrow(ShapeJsonError);
    expect(() => assertFillDrawn(bitmap, 'paths[2].fill', none)).toThrow('paths[2].fill: fill kind not drawn: bitmap');
    expect(() => assertFillDrawn(solid, 'paths[3].fill', none)).not.toThrow();
  });

  it('follows the capabilities it is given', () => {
    const caps: DrawnFills = { gradientLinear: true, gradientRadial: false, bitmap: true };
    expect(() => assertFillDrawn(radial, 'g', DRAWN_FILLS)).not.toThrow();
    expect(() => assertFillDrawn(linear, 'f', caps)).not.toThrow();
    expect(() => assertFillDrawn(bitmap, 'f', caps)).not.toThrow();
    expect(() => assertFillDrawn(radial, 'f', caps)).toThrow('f: fill kind not drawn: gradient-radial');
  });

  it('assertShapeDrawn reports the first undrawn fill by path index and ignores paths without a fill', () => {
    const contours = [{ outer: [['M', 0, 0], ['Z']] as never, holes: [] }];
    const shape = {
      formatVersion: 1 as const,
      paths: [
        { contours, fill: solid, stroke: null },
        { contours, fill: null, stroke: null },
        { contours, fill: bitmap, stroke: null },
      ],
    };
    expect(() => assertShapeDrawn(shape)).not.toThrow();
    const none: DrawnFills = { gradientLinear: false, gradientRadial: false, bitmap: false };
    expect(() => assertShapeDrawn(shape, none)).toThrow('paths[2].fill: fill kind not drawn: bitmap');
  });
});
