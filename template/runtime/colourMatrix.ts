// The colour matrix (breadth design section 4, "Colour offsets"). Core: no node module, clock or randomness.
//
// Flash applies `c' = clamp(c * mul + add)` per channel with `add` in 0..255; Pixi's ColorMatrixFilter works on 0..1
// channels, so the offsets are divided by 255. The matrix is row-major 4x5 (rows r, g, b, a; columns r, g, b, a, 1).

import type { ColorTransform8 } from './scene';

/** Row-major 4x5 ColorMatrixFilter matrix for rMul gMul bMul aMul rAdd gAdd bAdd aAdd (adds in 0..255). Full Flash formula. */
export function colourMatrix(ct: Readonly<ColorTransform8>): number[] {
  const [rm, gm, bm, am, ra, ga, ba, aa] = ct;
  return [
    rm, 0, 0, 0, ra / 255,
    0, gm, 0, 0, ga / 255,
    0, 0, bm, 0, ba / 255,
    0, 0, 0, am, aa / 255,
  ];
}

/** True when any of the four offsets is non-zero. */
export function hasOffsets(ct: Readonly<ColorTransform8>): boolean {
  return ct[4] !== 0 || ct[5] !== 0 || ct[6] !== 0 || ct[7] !== 0;
}

/** True when the alpha add term is non-zero (not drawn exactly by the filter; design section 4). */
export function hasAlphaAdd(ct: Readonly<ColorTransform8>): boolean {
  return ct[7] !== 0;
}

/** The transform with the alpha add term replaced by 0, so the filter does not paint the box around the glyphs. */
export function stripAlphaAdd(ct: Readonly<ColorTransform8>): ColorTransform8 {
  return [ct[0], ct[1], ct[2], ct[3], ct[4], ct[5], ct[6], 0];
}
