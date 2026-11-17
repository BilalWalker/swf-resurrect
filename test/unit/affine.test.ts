import { describe, expect, it } from "vitest";
import { applyAffine, invert, multiply, transformBox, transformMatrix, unionBox } from "../../template/runtime/affine";
// Units of template/runtime/affine.ts (as3-coverage task 26.2), which getBounds and pixelsOverlap share.
describe("affine", () => {
  it("transformMatrix rotates then translates; multiply applies the inner matrix first", () => {
    const m = transformMatrix({ x: 10, y: 0, scaleX: 2, scaleY: 1, rotation: 90 });
    const [px, py] = applyAffine(m, 1, 0);
    expect(px).toBeCloseTo(10);
    expect(py).toBeCloseTo(2);
    const both = multiply([1, 0, 0, 1, 5, 0], [2, 0, 0, 2, 0, 0]);
    expect(applyAffine(both, 1, 1)).toEqual([7, 2]);
  });
  it("invert undoes a matrix and returns null for a singular one", () => {
    const m = transformMatrix({ x: 3, y: 4, scaleX: 2, scaleY: 3, rotation: 30 });
    const inv = invert(m)!;
    const [x, y] = applyAffine(inv, ...applyAffine(m, 5, 6));
    expect(x).toBeCloseTo(5);
    expect(y).toBeCloseTo(6);
    expect(invert([0, 0, 0, 0, 1, 1])).toBeNull();
  });
  it("transformBox and unionBox give axis-aligned boxes", () => {
    const b = transformBox(transformMatrix({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90 }), { x: 0, y: 0, width: 10, height: 20 });
    expect(b.x).toBeCloseTo(-20);
    expect(b.width).toBeCloseTo(20);
    expect(b.height).toBeCloseTo(10);
    expect(unionBox(null, null)).toBeNull();
    expect(unionBox({ x: 0, y: 0, width: 1, height: 1 }, { x: 4, y: 4, width: 1, height: 1 })).toEqual({ x: 0, y: 0, width: 5, height: 5 });
  });
});
