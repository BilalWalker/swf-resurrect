import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Rectangle } from "../../template/shim/Rectangle";

// Integer coordinates keep the arithmetic exact, so equality checks need no tolerance.
const rect = fc
  .record({ x: fc.integer({ min: -500, max: 500 }), y: fc.integer({ min: -500, max: 500 }), w: fc.integer({ min: 0, max: 300 }), h: fc.integer({ min: 0, max: 300 }) })
  .map(({ x, y, w, h }) => new Rectangle(x, y, w, h));

const tuple = (r: Rectangle): number[] => [r.x, r.y, r.width, r.height];

describe("Property 23: Rectangle algebra", () => {
  /** **Validates: Requirements 23.6, 23.8** */
  it("intersection is commutative, inside both operands, no larger than the smaller one, zero when disjoint", () => {
    fc.assert(
      fc.property(rect, rect, (a, b) => {
        const ab = a.intersection(b);
        const ba = b.intersection(a);
        expect(tuple(ab)).toEqual(tuple(ba));
        const area = (r: Rectangle): number => r.width * r.height;
        expect(area(ab)).toBeLessThanOrEqual(Math.min(area(a), area(b)));
        if (ab.width > 0 && ab.height > 0) {
          for (const o of [a, b]) {
            expect(ab.left).toBeGreaterThanOrEqual(o.left);
            expect(ab.top).toBeGreaterThanOrEqual(o.top);
            expect(ab.right).toBeLessThanOrEqual(o.right);
            expect(ab.bottom).toBeLessThanOrEqual(o.bottom);
          }
          expect(a.intersects(b)).toBe(true);
        } else {
          expect(tuple(ab)).toEqual([0, 0, 0, 0]);
          expect(a.intersects(b)).toBe(false);
        }
      }),
    );
  });

  /** **Validates: Requirements 23.9** */
  it("offset(dx, dy) then offset(-dx, -dy) restores the rectangle", () => {
    fc.assert(
      fc.property(rect, fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), (r, dx, dy) => {
        const before = tuple(r);
        r.offset(dx, dy);
        r.offset(-dx, -dy);
        expect(tuple(r)).toEqual(before);
      }),
    );
  });
});
