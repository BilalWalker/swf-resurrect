// 2D affine matrices as [a, b, c, d, tx, ty] (x' = a*x + c*y + tx, y' = b*x + d*y + ty), the form of Scene_JSON
// matrices. Pure: no node module, clock or randomness. Shared by `getBounds` (shim/bounds.ts) and `pixelsOverlap`.

export type Affine = readonly [number, number, number, number, number, number];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** The matrix of a display object into its parent: translation, then rotation (degrees), then scale. */
export function transformMatrix(t: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }): Affine {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos * t.scaleX, sin * t.scaleX, -sin * t.scaleY, cos * t.scaleY, t.x, t.y];
}

/** `outer` after `inner`: apply `inner` first. */
export function multiply(outer: Affine, inner: Affine): Affine {
  const [a, b, c, d, tx, ty] = outer;
  const [e, f, g, h, ux, uy] = inner;
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h, a * ux + c * uy + tx, b * ux + d * uy + ty];
}

/** The inverse, or null when the matrix is singular. */
export function invert(m: Affine): Affine | null {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (det === 0 || !Number.isFinite(det)) return null;
  return [d / det, -b / det, -c / det, a / det, (c * ty - d * tx) / det, (b * tx - a * ty) / det];
}

export function applyAffine(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** The axis-aligned box of the four transformed corners of `box`. */
export function transformBox(m: Affine, box: Box): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [cx, cy] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ] as const) {
    const [px, py] = applyAffine(m, cx, cy);
    xs.push(px);
    ys.push(py);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The box that holds both, or the other one when one is null. */
export function unionBox(a: Box | null, b: Box | null): Box | null {
  if (a === null) return b;
  if (b === null) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
