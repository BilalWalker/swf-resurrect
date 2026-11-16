// Pure plan from recorded Graphics primitives to draw operations (as3-coverage task 15.2, Requirements 14.5, 14.6).
import type { GfxPrim } from '../shim/Graphics';

export interface GfxStroke {
  width: number;
  /** 0xRRGGBB. */
  color: number;
}

/** One drawn shape. `fill` is 0xRRGGBB or null; `stroke` is null when no line style is active. */
export type GfxDraw =
  | { kind: 'circle'; x: number; y: number; r: number; fill: number | null; stroke: GfxStroke | null }
  | { kind: 'polyline'; points: [number, number][]; fill: number | null; stroke: GfxStroke | null };

/**
 * Walks the primitives once. A polyline is a run of moveTo/lineTo under one fill and one line style: a change of
 * either, a moveTo, a circle or the end of the list ends it. A change continues from the pen position.
 * - A polyline with a fill and at least three points is filled as a closed shape; a fill that was never ended is
 *   applied at the end of the list, as Flash fills at render time (Requirement 14.6).
 * - Its stroke covers only the segments that were drawn: an open path is not closed (Requirement 14.5).
 * - A polyline without a fill and with fewer than two points draws nothing.
 * Limit: a moveTo inside one fill starts a separate shape, so a fill with a hole made of two subpaths is not cut out.
 */
export function planGraphics(prims: readonly GfxPrim[]): GfxDraw[] {
  const out: GfxDraw[] = [];
  let fill: number | null = null;
  let stroke: GfxStroke | null = null;
  let penX = 0;
  let penY = 0;
  let points: [number, number][] = [];
  const flush = (): void => {
    const drawable = fill !== null ? points.length >= 3 || (stroke !== null && points.length >= 2) : points.length >= 2 && stroke !== null;
    if (drawable) out.push({ kind: 'polyline', points, fill: fill !== null && points.length >= 3 ? fill : null, stroke });
    points = [];
  };
  for (const p of prims) {
    switch (p.k) {
      case 'lineStyle':
        flush();
        stroke = { width: p.width, color: p.color };
        break;
      case 'lineOff':
        flush();
        stroke = null;
        break;
      case 'beginFill':
        flush();
        fill = p.color;
        break;
      case 'endFill':
        flush();
        fill = null;
        break;
      case 'moveTo':
        flush();
        penX = p.x;
        penY = p.y;
        break;
      case 'lineTo':
        if (points.length === 0) points.push([penX, penY]);
        points.push([p.x, p.y]);
        penX = p.x;
        penY = p.y;
        break;
      case 'circle':
        flush();
        out.push({ kind: 'circle', x: p.x, y: p.y, r: p.r, fill, stroke });
        break;
    }
  }
  flush();
  return out;
}
