// pixelsOverlap: do two display trees cover a common pixel? A pure Runtime function (as3-coverage Requirement 23,
// design "Collision helper"): no Flash type, no node module, no clock or randomness, so it runs in Node (Replay,
// FakeBackend) and in the browser. The Flash route (BitmapData.draw with a ColorTransform and BlendMode.DIFFERENCE,
// then getColorBoundsRect) is replaced by a coverage mask: the pixel centres in the intersection of the two stage-space
// bounds are tested against the filled contours of both trees.

import { multiply, transformMatrix, type Affine } from './affine';
import type { Contour, PathCmd, ShapeJson } from './shapeJson';
import { namedLimit } from '../shim/errorSink';

/**
 * What the helper reads from a display object: its transform fields, its parent chain and children, and the parsed
 * Shape_JSON of a shape symbol. A Flash DisplayObject has these members; the type names none of the Flash classes.
 * A parent without `scaleX` (the Stage_Object) ends the chain.
 */
export interface OverlapNode {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Degrees. */
  readonly rotation: number;
  readonly _parent: object | null;
  readonly _children?: readonly OverlapNode[];
  readonly _shapeJson?: ShapeJson | null;
}

const CURVE_STEPS = 8;

type Ring = readonly (readonly [number, number])[];

/** One path of one shape, flattened into stage space: the rings of its contours and the box of the outer rings. */
interface Region {
  contours: { outer: Ring[]; holes: Ring[] }[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function isTransformNode(p: object | null): p is OverlapNode {
  return p !== null && typeof (p as { scaleX?: unknown }).scaleX === 'number';
}

/** Flattens the commands into rings (one per M), curves into `CURVE_STEPS` segments, through `m`. */
function flatten(cmds: readonly PathCmd[], m: Affine): Ring[] {
  const rings: [number, number][][] = [];
  let cur: [number, number][] | null = null;
  let px = 0;
  let py = 0;
  const pt = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  for (const c of cmds) {
    switch (c[0]) {
      case 'M':
        cur = [pt(c[1], c[2])];
        rings.push(cur);
        px = c[1];
        py = c[2];
        break;
      case 'L':
        cur?.push(pt(c[1], c[2]));
        px = c[1];
        py = c[2];
        break;
      case 'Q':
        for (let i = 1; i <= CURVE_STEPS; i++) {
          const t = i / CURVE_STEPS;
          const u = 1 - t;
          cur?.push(pt(u * u * px + 2 * u * t * c[1] + t * t * c[3], u * u * py + 2 * u * t * c[2] + t * t * c[4]));
        }
        px = c[3];
        py = c[4];
        break;
      case 'C':
        for (let i = 1; i <= CURVE_STEPS; i++) {
          const t = i / CURVE_STEPS;
          const u = 1 - t;
          cur?.push(
            pt(
              u * u * u * px + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5],
              u * u * u * py + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
            ),
          );
        }
        px = c[5];
        py = c[6];
        break;
      case 'Z':
        break; // rings are closed by the point-in-polygon test
    }
  }
  return rings;
}

function regionOf(contours: readonly Contour[], m: Affine): Region | null {
  const out: Region['contours'] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of contours) {
    const outer = flatten(c.outer, m);
    for (const ring of outer)
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    out.push({ outer, holes: c.holes.flatMap((h) => flatten(h, m)) });
  }
  return out.length === 0 || minX === Infinity ? null : { contours: out, minX, minY, maxX, maxY };
}

/** The matrix of `node` into the Stage_Object's space: its own transform, then each parent's. */
function stageMatrix(obj: OverlapNode): Affine {
  let m = transformMatrix(obj);
  for (let p = obj._parent; isTransformNode(p); p = p._parent) m = multiply(transformMatrix(p), m);
  return m;
}

/**
 * Every filled path of the tree. The `visible` flag is ignored (Ruffle `BitmapData.draw` draws its source without a
 * visibility test on the source; design Open_Item O5 for invisible children), and so is the alpha of a fill: the
 * Flash route adds 255 to the alpha channel, so a fill of any alpha, even 0, becomes opaque in the mask. Strokes
 * are not counted.
 */
function regionsOf(obj: OverlapNode, m: Affine, out: Region[]): void {
  const shape = obj._shapeJson;
  if (shape) {
    for (const path of shape.paths) {
      if (path.fill === null) continue;
      const r = regionOf(path.contours, m);
      if (r !== null) out.push(r);
    }
  }
  for (const c of obj._children ?? []) regionsOf(c, multiply(m, transformMatrix(c)), out);
}

function inRing(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd inside the outer rings of a contour (so two overlapping rings of one outline cancel) and in no hole. */
function inRegion(r: Region, x: number, y: number): boolean {
  if (x < r.minX || x >= r.maxX || y < r.minY || y >= r.maxY) return false;
  for (const c of r.contours) {
    let inside = false;
    for (const ring of c.outer) if (inRing(ring, x, y)) inside = !inside;
    if (!inside) continue;
    if (!c.holes.some((h) => inRing(h, x, y))) return true;
  }
  return false;
}

function boxOf(regions: readonly Region[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (regions.length === 0) return null;
  return {
    minX: Math.min(...regions.map((r) => r.minX)),
    minY: Math.min(...regions.map((r) => r.minY)),
    maxX: Math.max(...regions.map((r) => r.maxX)),
    maxY: Math.max(...regions.map((r) => r.maxY)),
  };
}

/**
 * True when a pixel centre (integer + 0.5, stage space) lies inside a filled shape of `a` and inside one of `b`.
 * Symmetric. Records the Named_Limit `collision-coverage-mask` on every use.
 */
export function pixelsOverlap(a: OverlapNode, b: OverlapNode): boolean {
  namedLimit(
    'collision-coverage-mask',
    'pixelsOverlap counts pixel centres inside both shapes (coverage mask); antialiased edge pixels, which Flash does not count either, and sub-pixel slivers can differ by about one pixel',
  );
  const ra: Region[] = [];
  const rb: Region[] = [];
  regionsOf(a, stageMatrix(a), ra);
  regionsOf(b, stageMatrix(b), rb);
  const ba = boxOf(ra);
  const bb = boxOf(rb);
  if (ba === null || bb === null) return false;
  const x0 = Math.max(ba.minX, bb.minX);
  const y0 = Math.max(ba.minY, bb.minY);
  const x1 = Math.min(ba.maxX, bb.maxX);
  const y1 = Math.min(ba.maxY, bb.maxY);
  if (!(x1 > x0) || !(y1 > y0)) return false;
  for (let iy = Math.ceil(y0 - 0.5); iy + 0.5 < y1; iy++) {
    const y = iy + 0.5;
    for (let ix = Math.ceil(x0 - 0.5); ix + 0.5 < x1; ix++) {
      const x = ix + 0.5;
      if (ra.some((r) => inRegion(r, x, y)) && rb.some((r) => inRegion(r, x, y))) return true;
    }
  }
  return false;
}
