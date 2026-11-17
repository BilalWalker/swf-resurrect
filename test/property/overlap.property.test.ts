import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pixelsOverlap } from "../../template/runtime/overlap";
import { node, rectShape } from "../support/overlapFixtures";

// Generated axis-aligned rectangles placed by x, y, scale and a rotation in quarter turns, so the stage-space box of
// every shape is known exactly (even sizes keep every edge on an integer, never on a pixel centre). No sample name and no Flash class.
const shapeArb = fc.record({
  x: fc.integer({ min: -40, max: 40 }),
  y: fc.integer({ min: -40, max: 40 }),
  w: fc.integer({ min: 1, max: 15 }).map((n) => n * 2),
  h: fc.integer({ min: 1, max: 15 }).map((n) => n * 2),
  sx: fc.constantFrom(0.5, 1, 2),
  sy: fc.constantFrom(0.5, 1, 2),
  quarter: fc.constantFrom(0, 90, 180, 270),
});
type Spec = { x: number; y: number; w: number; h: number; sx: number; sy: number; quarter: number };

const build = (s: Spec) => node({ x: s.x, y: s.y, scaleX: s.sx, scaleY: s.sy, rotation: s.quarter, shape: rectShape(0, 0, s.w, s.h) });

/** Stage-space box of a spec: the four corners through scale, then rotation, then translation. */
function box(s: Spec): { minX: number; minY: number; maxX: number; maxY: number } {
  const rad = (s.quarter * Math.PI) / 180;
  const c = Math.round(Math.cos(rad));
  const n = Math.round(Math.sin(rad));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of [[0, 0], [s.w, 0], [0, s.h], [s.w, s.h]] as const) {
    const lx = px * s.sx;
    const ly = py * s.sy;
    xs.push(c * lx - n * ly + s.x);
    ys.push(n * lx + c * ly + s.y);
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

describe("Property 22: pixelsOverlap is symmetric and bounded", () => {
  /** **Validates: Requirements 23.2, 23.3** */
  it("is symmetric", () => {
    fc.assert(fc.property(shapeArb, shapeArb, (a, b) => pixelsOverlap(build(a), build(b)) === pixelsOverlap(build(b), build(a))), { numRuns: 200 });
  });

  /** **Validates: Requirements 23.2** */
  it("is false when the stage-space bounds are disjoint", () => {
    fc.assert(
      fc.property(shapeArb, shapeArb, (a, b) => {
        const ba = box(a);
        const bb = box(b);
        fc.pre(ba.maxX <= bb.minX || bb.maxX <= ba.minX || ba.maxY <= bb.minY || bb.maxY <= ba.minY);
        expect(pixelsOverlap(build(a), build(b))).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /** **Validates: Requirements 23.2, 23.3** */
  it("agrees with a pixel-by-pixel reading of the two boxes", () => {
    fc.assert(
      fc.property(shapeArb, shapeArb, (a, b) => {
        const ba = box(a);
        const bb = box(b);
        let expected = false;
        // Boxes are axis-aligned and exact, so a centre is inside both when it is inside both boxes.
        for (let y = Math.floor(Math.max(ba.minY, bb.minY)); y <= Math.ceil(Math.min(ba.maxY, bb.maxY)) && !expected; y++) {
          for (let x = Math.floor(Math.max(ba.minX, bb.minX)); x <= Math.ceil(Math.min(ba.maxX, bb.maxX)) && !expected; x++) {
            const cx = x + 0.5;
            const cy = y + 0.5;
            const inside = (r: typeof ba): boolean => cx > r.minX && cx < r.maxX && cy > r.minY && cy < r.maxY;
            expected = inside(ba) && inside(bb);
          }
        }
        expect(pixelsOverlap(build(a), build(b))).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });
});
