import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { compareImages } from '../../src/verify/core/pixelDiff';
import { genBackground, genImage, genIndependentPair, genNearPair } from './gen/genImage';
import { fcConfig } from './config';

describe('pixel diff properties', () => {
  // Feature: verify, Property 2: Pixel diff identity
  it('Property 2: comparing an image with itself gives zero differing pixels and 100%', () => {
    fc.assert(
      fc.property(genImage, genBackground, (img, bg) => {
        const r = compareImages(img, img, bg);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.differingPixels).toBe(0);
        expect(r.value.totalPixels).toBe(img.width * img.height);
        expect(r.value.matchHundredths).toBe(10000);
      }),
      fcConfig,
    );
  });

  // Feature: verify, Property 3: Pixel diff symmetry
  it('Property 3: swapping reference and rendered gives the same result', () => {
    const pairs = fc.oneof(genNearPair(), genIndependentPair);
    fc.assert(
      fc.property(pairs, genBackground, ([a, b], bg) => {
        const ab = compareImages(a, b, bg);
        const ba = compareImages(b, a, bg);
        expect(ab.ok && ba.ok).toBe(true);
        if (!ab.ok || !ba.ok) return;
        expect(ba.value.differingPixels).toBe(ab.value.differingPixels);
        expect(ba.value.totalPixels).toBe(ab.value.totalPixels);
        expect(ba.value.matchHundredths).toBe(ab.value.matchHundredths);
        expect(Array.from(ba.value.mask)).toEqual(Array.from(ab.value.mask));
      }),
      fcConfig,
    );
  });
});
