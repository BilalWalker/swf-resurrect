import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { colourMatrix, hasAlphaAdd, hasOffsets, stripAlphaAdd } from "../../template/runtime/colourMatrix";
import type { ColorTransform8 } from "../../template/runtime/scene";
import { fcConfig } from "./config";

const num = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
const offset = fc.oneof({ weight: 1, arbitrary: fc.constant(0) }, { weight: 3, arbitrary: num(-255, 255) });
const genCt: fc.Arbitrary<ColorTransform8> = fc.tuple(
  num(-2, 2), num(-2, 2), num(-2, 2), num(-2, 2), offset, offset, offset, offset,
);
const genPixel = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }));

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Applies a row-major 4x5 matrix to (r, g, b, a) in 0..1, then clamps. */
function applyMatrix(m: number[], p: number[]): number[] {
  return [0, 1, 2, 3].map((row) => clamp01(m[row * 5]! * p[0]! + m[row * 5 + 1]! * p[1]! + m[row * 5 + 2]! * p[2]! + m[row * 5 + 3]! * p[3]! + m[row * 5 + 4]!));
}

// Feature: breadth, Property 8: The colour matrix equals the Flash formula
// **Validates: Requirements 13.5, 13.6**
describe("colourMatrix equals the Flash formula", () => {
  it("matches clamp((c * mul + add) / 255) per channel", () => {
    fc.assert(
      fc.property(genCt, genPixel, (ct, px) => {
        const got = applyMatrix(colourMatrix(ct), px.map((v) => v / 255));
        for (let i = 0; i < 4; i++) {
          const want = clamp01((px[i]! * ct[i]! + ct[4 + i]!) / 255);
          expect(Math.abs(got[i]! - want)).toBeLessThan(1e-9);
        }
      }),
      fcConfig,
    );
  });

  it("hasOffsets is true exactly when an offset is non-zero", () => {
    fc.assert(
      fc.property(genCt, (ct) => {
        expect(hasOffsets(ct)).toBe(ct.slice(4).some((v) => v !== 0));
      }),
      fcConfig,
    );
  });

  it("stripAlphaAdd keeps the other seven numbers and zeroes the alpha add", () => {
    fc.assert(
      fc.property(genCt, (ct) => {
        const s = stripAlphaAdd(ct);
        expect(s.slice(0, 7)).toEqual(ct.slice(0, 7));
        expect(s[7]).toBe(0);
        expect(colourMatrix(s)[19]).toBe(0);
        expect(hasAlphaAdd(s)).toBe(false);
        expect(hasAlphaAdd(ct)).toBe(ct[7] !== 0);
      }),
      fcConfig,
    );
  });

  it("is the identity matrix for the identity transform", () => {
    expect(colourMatrix([1, 1, 1, 1, 0, 0, 0, 0])).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    expect(hasOffsets([1, 1, 1, 1, 0, 0, 0, 0])).toBe(false);
  });
});
