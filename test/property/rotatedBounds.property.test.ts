import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ShapeObject } from "../../template/runtime/stageTree";
import { Sprite } from "../../template/shim/Sprite";

const dim = fc.double({ min: 1, max: 500, noNaN: true });
const off = fc.double({ min: -200, max: 200, noNaN: true });
const rot = fc.double({ min: -720, max: 720, noNaN: true });

function clip(x: number, y: number, w: number, h: number): { c: Sprite; s: ShapeObject } {
  const c = new Sprite();
  const s = new ShapeObject(1, { x, y, width: w, height: h });
  c.addChild(s);
  return { c, s };
}

describe("Property 26: Rotated bounds contain the corners", () => {
  /** **Validates: Requirements 30.1, 30.6, 30.7** */
  it("the rotated size contains the four rotated corners and spans exactly them", () => {
    fc.assert(
      fc.property(off, off, dim, dim, rot, (x, y, w, h, deg) => {
        const { c } = clip(x, y, w, h);
        c.rotation = deg;
        const a = (c.rotation * Math.PI) / 180;
        const xs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => px * Math.cos(a) - py * Math.sin(a));
        const ys = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => px * Math.sin(a) + py * Math.cos(a));
        expect(c.width).toBeGreaterThanOrEqual(Math.max(...xs) - Math.min(...xs) - 1e-6);
        expect(c.width).toBeLessThanOrEqual(Math.max(...xs) - Math.min(...xs) + 1e-6);
        expect(c.height).toBeGreaterThanOrEqual(Math.max(...ys) - Math.min(...ys) - 1e-6);
        expect(c.height).toBeLessThanOrEqual(Math.max(...ys) - Math.min(...ys) + 1e-6);
      }),
    );
  });

  it("90 degrees swaps width and height; 360 equals 0", () => {
    fc.assert(
      fc.property(off, off, dim, dim, (x, y, w, h) => {
        const { c } = clip(x, y, w, h);
        const w0 = c.width;
        const h0 = c.height;
        c.rotation = 90;
        expect(Math.abs(c.width - h0)).toBeLessThan(1e-6);
        expect(Math.abs(c.height - w0)).toBeLessThan(1e-6);
        c.rotation = 360;
        expect(Math.abs(c.width - w0)).toBeLessThan(1e-6);
        expect(Math.abs(c.height - h0)).toBeLessThan(1e-6);
      }),
    );
  });
});
