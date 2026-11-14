import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { groupContours } from "../../src/convert/evenOdd";
import type { PathCmd } from "../../template/runtime/shapeJson";
import { fcConfig } from "./config";
import { SAMPLE_SPAN, genContourCase } from "./gen/genContours";

// Feature: breadth, Property 5: Contour grouping agrees with the even-odd rule

function bbox(cmds: readonly PathCmd[]): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of cmds) {
    if (c[0] === "M" || c[0] === "L") {
      xs.push(c[1]);
      ys.push(c[2]);
    }
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function inside(cmds: readonly PathCmd[], x: number, y: number): boolean {
  const [x0, y0, x1, y1] = bbox(cmds);
  return x > x0 && x < x1 && y > y0 && y < y1;
}

describe("groupContours", () => {
  /** **Validates: Requirements 10.2, 15.5** */
  it("groupContours agrees with the even-odd model", () => {
    fc.assert(
      fc.property(
        genContourCase,
        fc.array(fc.tuple(fc.integer({ min: 0, max: SAMPLE_SPAN - 1 }), fc.integer({ min: 0, max: SAMPLE_SPAN - 1 })), {
          minLength: 60,
          maxLength: 60,
        }),
        (c, samples) => {
          const contours = groupContours(c.subpaths);
          // Every subpath lands exactly once, as an outer or as a hole.
          const placed = contours.reduce((n, k) => n + 1 + k.holes.length, 0);
          expect(placed).toBe(c.subpaths.length);
          // Sample points at half-integers never lie on a rectangle edge. Add one point inside every rectangle.
          const points = samples.map(([x, y]): [number, number] => [x + 0.5, y + 0.5]);
          for (const r of c.rects) points.push([r.x0 + 2.5, r.y0 + 2.5]);
          for (const [x, y] of points) {
            const parity = c.subpaths.filter((s) => inside(s, x, y)).length % 2 === 1;
            const filled = contours.some((k) => inside(k.outer, x, y) && !k.holes.some((h) => inside(h, x, y)));
            expect(filled).toBe(parity);
          }
          // Every hole lies inside its outer contour.
          for (const k of contours) {
            for (const h of k.holes) {
              const [hx, hy] = bbox(h);
              expect(inside(k.outer, hx + 0.5, hy + 0.5)).toBe(true);
            }
          }
        },
      ),
      fcConfig,
    );
  });

  it("is deterministic and keeps input order", () => {
    fc.assert(
      fc.property(genContourCase, (c) => {
        expect(groupContours(c.subpaths)).toEqual(groupContours(c.subpaths));
      }),
      fcConfig,
    );
  });

  it("makes a ring a contour with one hole, and a disc inside the hole its own contour", () => {
    const sq = (a: number, b: number): PathCmd[] => [["M", a, a], ["L", b, a], ["L", b, b], ["L", a, b], ["Z"]];
    const r = groupContours([sq(40, 60), sq(0, 100), sq(20, 80)]);
    expect(r).toHaveLength(2);
    expect(r[0].outer).toEqual(sq(40, 60));
    expect(r[0].holes).toEqual([]);
    expect(r[1].outer).toEqual(sq(0, 100));
    expect(r[1].holes).toEqual([sq(20, 80)]);
    expect(groupContours([])).toEqual([]);
  });
});
