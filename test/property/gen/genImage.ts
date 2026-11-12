import * as fc from 'fast-check';
import type { RgbaImage } from '../../../src/verify/core/pixelDiff';

const dim = fc.integer({ min: 1, max: 24 });
const byte = fc.integer({ min: 0, max: 255 });

/** RGBA image 1x1 to 24x24, any alpha. */
export const genImage: fc.Arbitrary<RgbaImage> = fc
  .tuple(dim, dim)
  .chain(([width, height]) =>
    fc.uint8Array({ minLength: width * height * 4, maxLength: width * height * 4 }).map((data) => ({ width, height, data })),
  );

/** Opaque background colour. */
export const genBackground: fc.Arbitrary<readonly [number, number, number]> = fc.tuple(byte, byte, byte);

/** Pair of same-size images where the second differs by at most `maxDelta` per channel. */
export function genNearPair(maxDelta = 12): fc.Arbitrary<[RgbaImage, RgbaImage]> {
  return genImage.chain((a) =>
    fc
      .array(fc.integer({ min: -maxDelta, max: maxDelta }), { minLength: a.data.length, maxLength: a.data.length })
      .map((deltas): [RgbaImage, RgbaImage] => {
        const data = new Uint8Array(a.data.length);
        for (let i = 0; i < data.length; i++) data[i] = Math.min(255, Math.max(0, a.data[i] + deltas[i]));
        return [a, { width: a.width, height: a.height, data }];
      }),
  );
}

/** Pair of independent random images of the same size. */
export const genIndependentPair: fc.Arbitrary<[RgbaImage, RgbaImage]> = fc
  .tuple(dim, dim)
  .chain(([width, height]) => {
    const img = fc
      .uint8Array({ minLength: width * height * 4, maxLength: width * height * 4 })
      .map((data): RgbaImage => ({ width, height, data }));
    return fc.tuple(img, img);
  });
