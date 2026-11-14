// The gradient matrix (breadth design section 3, "Gradient matrix"). Core: no node module, clock or randomness.
//
// FFDec writes a gradient in a fixed square: x from -GRADIENT_HALF_EXTENT to +GRADIENT_HALF_EXTENT for a linear
// gradient, radius GRADIENT_HALF_EXTENT around (0, 0) for a radial one, and `gradientTransform` (the matrix M of the
// Shape_JSON fill) places that square in shape space. Pixi draws a gradient from a GRADIENT_TEXTURE_SIZE texture (256,
// `FillGradient` default `textureSize`) and a `transform` from texture pixels to the space of the shape. The matrix
// below is that composition, `M x (texture to square)`; the backend gets the same result from Pixi's own transform.

import type { Mat6 } from './shapeJson';

export const GRADIENT_HALF_EXTENT = 819.2;
export const GRADIENT_TEXTURE_SIZE = 256;

/** Texture pixels to the FFDec square: 2 * 819.2 / 256 = 6.4 per pixel, then shifted by -819.2. */
const K = (2 * GRADIENT_HALF_EXTENT) / GRADIENT_TEXTURE_SIZE;

/** [a b c d tx ty] with x' = a x + c y + tx and y' = b x + d y + ty (SVG and Pixi order). Returns `m x n` (n first). */
function mul(m: Readonly<Mat6>, n: Readonly<Mat6>): Mat6 {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/**
 * The matrix from texture space to shape space for a fill whose `gradientTransform` is `m`.
 * Linear: the texture is 256 x 1, so x 0..256 covers the square's x -819.2..819.2 and y is kept (the row is constant in y).
 * Radial: the texture is 256 x 256 and covers the whole square, so the texture centre (128, 128) is the origin.
 */
export function gradientTextureMatrix(m: Readonly<Mat6>, type: 'linear' | 'radial' = 'linear'): Mat6 {
  const toSquare: Mat6 =
    type === 'linear'
      ? [K, 0, 0, 1, -GRADIENT_HALF_EXTENT, 0]
      : [K, 0, 0, K, -GRADIENT_HALF_EXTENT, -GRADIENT_HALF_EXTENT];
  return mul(m, toSquare);
}
