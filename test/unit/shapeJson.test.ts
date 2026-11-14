import { describe, expect, it } from 'vitest';
import {
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
  it('is all false in the commit that introduces the Shape_Function', () => {
    expect(DRAWN_FILLS).toEqual({ gradientLinear: false, gradientRadial: false, bitmap: false });
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

  it('refuses every gradient and bitmap fill under the committed DRAWN_FILLS', () => {
    expect([linear, radial, bitmap].map((f) => fillIsDrawn(f, DRAWN_FILLS))).toEqual([false, false, false]);
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
