import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { parseStructure } from '../../src/convert/ffdecXml';
import { placeItem, wrapDump } from '../support/matrixXml';
import { fcConfig } from './config';

/**
 * Property 2: Preservation - matrices without scale or rotate are unchanged.
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

function matrixOf(attrs: string) {
  const op = parseStructure(wrapDump(placeItem(attrs))).root.ops.find((o) => o.kind === 'place');
  if (!op || op.kind !== 'place' || !op.matrix) throw new Error('no matrix');
  return op.matrix;
}

describe('matrix preservation properties', () => {
  it('both flags false: identity scale, zero skew, translation unchanged in twips', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2_000_000, max: 2_000_000 }), fc.integer({ min: -2_000_000, max: 2_000_000 }), (tx, ty) => {
        const m = matrixOf(`hasRotate="false" hasScale="false" translateX="${tx}" translateY="${ty}"`);
        expect(m.a).toBe(1);
        expect(m.d).toBe(1);
        expect(m.b === 0 && m.c === 0).toBe(true);
        expect(m.txTwips).toBe(tx);
        expect(m.tyTwips).toBe(ty);
      }),
      fcConfig,
    );
  });

  it('both flags false: stray scale/skew attributes are ignored', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: -100000, max: 100000 }),
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.double({ min: -10, max: 10, noNaN: true }),
        (tx, ty, s, r) => {
          const m = matrixOf(
            `hasRotate="false" hasScale="false" scaleX="${s}" scaleY="${s}" rotateSkew0="${r}" rotateSkew1="${r}" translateX="${tx}" translateY="${ty}"`,
          );
          expect([m.a, m.d]).toEqual([1, 1]);
          expect(m.b === 0 && m.c === 0).toBe(true);
          expect([m.txTwips, m.tyTwips]).toEqual([tx, ty]);
        },
      ),
      fcConfig,
    );
  });

  it('translation is not scaled by the scale/rotate flags: twips stay integer for any flag combination', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.integer({ min: -100000, max: 100000 }), fc.integer({ min: -100000, max: 100000 }), (hs, hr, tx, ty) => {
        const m = matrixOf(`hasRotate="${hr}" hasScale="${hs}" translateX="${tx}" translateY="${ty}"`);
        expect([m.txTwips, m.tyTwips]).toEqual([tx, ty]);
      }),
      fcConfig,
    );
  });
});
