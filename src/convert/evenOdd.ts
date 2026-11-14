// Even-odd contour grouping for the Shape_Function (design D9). Pixi's Graphics has no even-odd flag, so Convert
// works out which subpaths are outer contours and which are holes, and the runtime fills each outer and cuts its holes.
// Core: no node module, clock, randomness or locale call (Requirement 15.2).

import type { Contour, PathCmd } from '../../template/runtime/shapeJson';

type Pt = readonly [number, number];

interface Poly {
  pts: Pt[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

/** The on-curve points of a subpath: the endpoint of every command (control points are skipped). */
function onCurvePoints(cmds: readonly PathCmd[]): Pt[] {
  const pts: Pt[] = [];
  for (const c of cmds) {
    switch (c[0]) {
      case 'M':
      case 'L':
        pts.push([c[1], c[2]]);
        break;
      case 'Q':
        pts.push([c[3], c[4]]);
        break;
      case 'C':
        pts.push([c[5], c[6]]);
        break;
      case 'Z':
        break;
    }
  }
  return pts;
}

function toPoly(cmds: readonly PathCmd[]): Poly {
  const pts = onCurvePoints(cmds);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    const [nx, ny] = pts[(i + 1) % pts.length];
    twice += x * ny - nx * y;
  }
  return { pts, minX, minY, maxX, maxY, area: Math.abs(twice) / 2 };
}

/** Ray casting (even-odd) against the closed polygon of on-curve points. */
function pointInPolygon(x: number, y: number, pts: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when polygon `a` lies inside polygon `b`: bounding boxes first, then a majority vote of a's points. */
function isInside(a: Poly, b: Poly): boolean {
  if (a.pts.length === 0 || b.pts.length < 3) return false;
  if (a.minX < b.minX || a.minY < b.minY || a.maxX > b.maxX || a.maxY > b.maxY) return false;
  let inside = 0;
  for (const [x, y] of a.pts) if (pointInPolygon(x, y, b.pts)) inside++;
  return inside * 2 > a.pts.length;
}

/**
 * Splits subpaths (each starting with `M`) into contours by the even-odd rule: the nesting depth of a subpath is the
 * number of other subpaths that contain it; even depths are outer contours, odd depths are holes of the smallest
 * enclosing outer contour. Outers keep the input order, and so do the holes of each outer.
 */
export function groupContours(subpaths: readonly (readonly PathCmd[])[]): Contour[] {
  const polys = subpaths.map(toPoly);
  const n = polys.length;
  const containers: number[][] = [];
  for (let i = 0; i < n; i++) {
    const list: number[] = [];
    for (let j = 0; j < n; j++) if (j !== i && isInside(polys[i], polys[j])) list.push(j);
    containers.push(list);
  }
  const outerOf = new Map<number, Contour>();
  const contours: Contour[] = [];
  for (let i = 0; i < n; i++) {
    if (containers[i].length % 2 === 0) {
      const c: Contour = { outer: [...subpaths[i]], holes: [] };
      outerOf.set(i, c);
      contours.push(c);
    }
  }
  for (let i = 0; i < n; i++) {
    if (containers[i].length % 2 === 0) continue;
    let best = -1;
    for (const j of containers[i]) {
      if (containers[j].length % 2 !== 0) continue;
      if (best === -1 || polys[j].area < polys[best].area) best = j;
    }
    const target = outerOf.get(best);
    if (target !== undefined) target.holes.push([...subpaths[i]]);
  }
  return contours;
}
