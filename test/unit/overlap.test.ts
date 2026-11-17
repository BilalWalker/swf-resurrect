import { describe, expect, it } from "vitest";
import { pixelsOverlap, type OverlapNode } from "../../template/runtime/overlap";
import type { ShapeJson } from "../../template/runtime/shapeJson";
import { takeNamedLimits } from "../../template/shim/errorSink";
import { node, rectCmds, rectShape } from "../support/overlapFixtures";

describe("pixelsOverlap", () => {
  it("is true for overlapping rectangles and false for disjoint ones", () => {
    expect(pixelsOverlap(node({ shape: rectShape(0, 0, 10, 10) }), node({ x: 5, y: 5, shape: rectShape(0, 0, 10, 10) }))).toBe(true);
    expect(pixelsOverlap(node({ shape: rectShape(0, 0, 10, 10) }), node({ x: 20, shape: rectShape(0, 0, 10, 10) }))).toBe(false);
  });

  it("is false for rectangles that only touch", () => {
    expect(pixelsOverlap(node({ shape: rectShape(0, 0, 10, 10) }), node({ x: 10, shape: rectShape(0, 0, 10, 10) }))).toBe(false);
  });

  it("does not count a pixel whose centre is outside a shape", () => {
    // The overlap is 0.4 pixels wide and holds no pixel centre (centres are at n + 0.5).
    expect(pixelsOverlap(node({ shape: rectShape(0, 0, 10.2, 10) }), node({ x: 9.8, shape: rectShape(0, 0, 10, 10) }))).toBe(false);
    expect(pixelsOverlap(node({ shape: rectShape(0, 0, 10.7, 10) }), node({ x: 9.4, shape: rectShape(0, 0, 10, 10) }))).toBe(true);
  });

  it("respects holes", () => {
    const ring = rectShape(0, 0, 30, 30, [rectCmds(10, 10, 10, 10)]);
    const inHole = node({ x: 12, y: 12, shape: rectShape(0, 0, 4, 4) });
    expect(pixelsOverlap(node({ shape: ring }), inHole)).toBe(false);
    expect(pixelsOverlap(node({ shape: ring }), node({ x: 8, y: 12, shape: rectShape(0, 0, 4, 4) }))).toBe(true);
  });

  it("applies scale and rotation of the object and of its parents", () => {
    const bar = rectShape(0, 0, 20, 2);
    const pivot = node({ x: 50, y: 50, rotation: 90 });
    const rotatedChild = node({ shape: bar, parent: pivot });
    // 90 degrees: the 20 x 2 bar stands at x 48..50, y 50..70.
    const probe = (x: number, y: number): OverlapNode => node({ x, y, shape: rectShape(0, 0, 1, 1) });
    expect(pixelsOverlap(rotatedChild, probe(48, 60))).toBe(true);
    expect(pixelsOverlap(rotatedChild, probe(55, 51))).toBe(false);
    const scaled = node({ scaleX: 3, shape: rectShape(0, 0, 10, 10) });
    expect(pixelsOverlap(scaled, probe(25, 5))).toBe(true);
    expect(pixelsOverlap(scaled, probe(35, 5))).toBe(false);
  });

  it("looks into nested children", () => {
    const leaf = node({ x: 40, shape: rectShape(0, 0, 10, 10) });
    const tree = node({ children: [node({ y: 5, children: [leaf] })] });
    expect(pixelsOverlap(tree, node({ x: 45, y: 10, shape: rectShape(0, 0, 2, 2) }))).toBe(true);
    expect(pixelsOverlap(tree, node({ x: 5, y: 10, shape: rectShape(0, 0, 2, 2) }))).toBe(false);
  });

  it("counts a fill of any alpha, a curved shape, and ignores a stroke-only path", () => {
    expect(pixelsOverlap(node({ shape: rectShape(0, 0, 10, 10, [], 0.2) }), node({ shape: rectShape(0, 0, 10, 10, [], 0) }))).toBe(true);
    const circle: ShapeJson = {
      formatVersion: 1,
      paths: [
        {
          contours: [
            {
              outer: [["M", 10, 0], ["C", 10, 5.52, 5.52, 10, 0, 10], ["C", -5.52, 10, -10, 5.52, -10, 0], ["C", -10, -5.52, -5.52, -10, 0, -10], ["C", 5.52, -10, 10, -5.52, 10, 0], ["Z"]],
              holes: [],
            },
          ],
          fill: { kind: "solid", color: "#00ff00", alpha: 1 },
          stroke: null,
        },
      ],
    };
    // The corner of the circle's box is outside the circle; its centre is inside.
    expect(pixelsOverlap(node({ shape: circle }), node({ x: 7, y: 7, shape: rectShape(0, 0, 3, 3) }))).toBe(false);
    expect(pixelsOverlap(node({ shape: circle }), node({ x: 4, y: 4, shape: rectShape(0, 0, 3, 3) }))).toBe(true);
    const line: ShapeJson = { formatVersion: 1, paths: [{ contours: [{ outer: rectCmds(0, 0, 10, 10), holes: [] }], fill: null, stroke: { color: "#000000", alpha: 1, width: 1, cap: "butt", join: "miter", miterLimit: 3 } }] };
    expect(pixelsOverlap(node({ shape: line }), node({ shape: rectShape(0, 0, 10, 10) }))).toBe(false);
  });

  it("is false for a tree without a shape", () => {
    expect(pixelsOverlap(node(), node({ shape: rectShape(0, 0, 10, 10) }))).toBe(false);
  });

  it("records the Named_Limit collision-coverage-mask", () => {
    takeNamedLimits();
    pixelsOverlap(node({ shape: rectShape(0, 0, 1, 1) }), node({ shape: rectShape(0, 0, 1, 1) }));
    expect(takeNamedLimits().map((l) => l.id)).toEqual(["collision-coverage-mask"]);
  });
});
