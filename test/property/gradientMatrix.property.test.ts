import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  GRADIENT_HALF_EXTENT,
  GRADIENT_TEXTURE_SIZE,
  gradientTextureMatrix,
} from "../../template/runtime/gradientMatrix";
import type { Mat6 } from "../../template/runtime/shapeJson";
import { fcConfig } from "./config";

const apply = (m: Readonly<Mat6>, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const num = (min: number, max: number) => fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
/** An invertible matrix: determinant bounded away from 0. */
const genInvertible: fc.Arbitrary<Mat6> = fc
  .tuple(num(-4, 4), num(-4, 4), num(-4, 4), num(-4, 4), num(-2000, 2000), num(-2000, 2000))
  .filter(([a, b, c, d]) => Math.abs(a * d - b * c) > 0.05) as fc.Arbitrary<Mat6>;

const close = (p: [number, number], q: [number, number]) => {
  const tol = 1e-6 * (1 + Math.max(...p.map(Math.abs), ...q.map(Math.abs)));
  expect(Math.abs(p[0] - q[0])).toBeLessThan(tol);
  expect(Math.abs(p[1] - q[1])).toBeLessThan(tol);
};

// Feature: breadth, Property 7: The gradient matrix maps texture space onto the FFDec square
describe("gradientTextureMatrix maps the FFDec square", () => {
  it("has the constants of the design", () => {
    expect(GRADIENT_HALF_EXTENT).toBe(819.2);
    expect(GRADIENT_TEXTURE_SIZE).toBe(256);
  });

  /** **Validates: Requirements 8.1, 8.6** */
  it("linear: texture x 0 and 256 land on M(-819.2, 0) and M(819.2, 0); the texture is one pixel tall", () => {
    fc.assert(
      fc.property(genInvertible, num(0, 256), num(-3, 3), (m, x, y) => {
        const t = gradientTextureMatrix(m);
        close(apply(t, 0, 0), apply(m, -GRADIENT_HALF_EXTENT, 0));
        close(apply(t, GRADIENT_TEXTURE_SIZE, 0), apply(m, GRADIENT_HALF_EXTENT, 0));
        // equals M x (texture to square) at any sampled point
        close(apply(t, x, y), apply(m, (x / GRADIENT_TEXTURE_SIZE) * 2 * GRADIENT_HALF_EXTENT - GRADIENT_HALF_EXTENT, y));
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 8.1, 8.6** */
  it("radial: the texture centre lands on M(0, 0) and the corners on the corners of the square", () => {
    fc.assert(
      fc.property(genInvertible, num(0, 256), num(0, 256), (m, x, y) => {
        const t = gradientTextureMatrix(m, "radial");
        const c = GRADIENT_TEXTURE_SIZE / 2;
        close(apply(t, c, c), apply(m, 0, 0));
        close(apply(t, 0, 0), apply(m, -GRADIENT_HALF_EXTENT, -GRADIENT_HALF_EXTENT));
        close(apply(t, GRADIENT_TEXTURE_SIZE, GRADIENT_TEXTURE_SIZE), apply(m, GRADIENT_HALF_EXTENT, GRADIENT_HALF_EXTENT));
        const k = (2 * GRADIENT_HALF_EXTENT) / GRADIENT_TEXTURE_SIZE;
        close(apply(t, x, y), apply(m, x * k - GRADIENT_HALF_EXTENT, y * k - GRADIENT_HALF_EXTENT));
      }),
      fcConfig,
    );
  });

  it("the identity maps the texture onto the square", () => {
    expect(gradientTextureMatrix([1, 0, 0, 1, 0, 0])).toEqual([6.4, 0, 0, 1, -819.2, 0]);
    expect(gradientTextureMatrix([1, 0, 0, 1, 0, 0], "radial")).toEqual([6.4, 0, 0, 6.4, -819.2, -819.2]);
  });
});
