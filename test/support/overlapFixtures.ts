import type { OverlapNode } from "../../template/runtime/overlap";

import type { PathCmd, ShapeJson } from "../../template/runtime/shapeJson";


export const rectCmds = (x: number, y: number, w: number, h: number): PathCmd[] => [
  ["M", x, y],
  ["L", x + w, y],
  ["L", x + w, y + h],
  ["L", x, y + h],
  ["Z"],
];

export function rectShape(x: number, y: number, w: number, h: number, holes: PathCmd[][] = [], alpha = 1): ShapeJson {
  return {
    formatVersion: 1,
    paths: [{ contours: [{ outer: rectCmds(x, y, w, h), holes }], fill: { kind: "solid", color: "#ff0000", alpha }, stroke: null }],
  };
}

/** A plain object with the members the helper reads; no Flash class. */
/** Rectangles and plain nodes for the pixelsOverlap tests. */
export function node(over: Partial<{ x: number; y: number; scaleX: number; scaleY: number; rotation: number; shape: ShapeJson | null; children: OverlapNode[]; parent: object | null }> = {}): OverlapNode {
  return {
    x: over.x ?? 0,
    y: over.y ?? 0,
    scaleX: over.scaleX ?? 1,
    scaleY: over.scaleY ?? 1,
    rotation: over.rotation ?? 0,
    _parent: over.parent ?? null,
    _children: over.children ?? [],
    _shapeJson: over.shape ?? null,
  };
}
