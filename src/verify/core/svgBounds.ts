// Shape bounds from an FFDec SVG (same result as test/unit/clickOracle.test.ts).

export interface SvgShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounds in the shape's own coordinate space: the SVG `width`/`height` in `px`,
 * positioned by the shape origin (the raw FFDec SVG shifts the shape so its bounds start at 0,0;
 * the emitted, flattened SVG has paths already in shape-origin space; size attributes are the same).
 * Returns null when the SVG has no px width or height.
 */
export function svgShapeBounds(svgText: string, origin: { x: number; y: number }): SvgShapeBounds | null {
  const w = /\bwidth="([\d.]+)px"/.exec(svgText);
  const h = /\bheight="([\d.]+)px"/.exec(svgText);
  if (w === null || h === null) return null;
  return { x: -origin.x, y: -origin.y, width: Number(w[1]), height: Number(h[1]) };
}
