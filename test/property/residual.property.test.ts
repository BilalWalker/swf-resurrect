// Property 27: Residual attribution is total and independent of the register's order.
// **Validates: Requirements 21.2, 21.3, 21.7**
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import type { DiffRegion } from '../../src/verify/core/regions';
import {
  ResidualRegisterError,
  attributeRegions,
  residualLimits,
  validateResidualRegister,
} from '../../src/verify/core/residual';
import type { ResidualEntry } from '../../src/verify/core/residual';

const N = 12;
const genBbox = fc
  .record({
    a: fc.integer({ min: 0, max: N - 1 }),
    b: fc.integer({ min: 0, max: N - 1 }),
    c: fc.integer({ min: 0, max: N - 1 }),
    d: fc.integer({ min: 0, max: N - 1 }),
  })
  .map(({ a, b, c, d }) => ({ x0: Math.min(a, b), x1: Math.max(a, b), y0: Math.min(c, d), y1: Math.max(c, d) }));
const genEntry: fc.Arbitrary<ResidualEntry> = fc.record({
  frame: fc.integer({ min: 0, max: 2 }),
  bbox: genBbox,
  kind: fc.constantFrom('a', 'b', 'c-1'),
  message: fc.constantFrom('x', 'y', 'z'),
});
const genRegions: fc.Arbitrary<DiffRegion[]> = fc
  .array(genBbox, { maxLength: 8 })
  .map((bs) => bs.map((bbox, i) => ({ id: i + 1, bbox, pixels: 1, first: { x: bbox.x0, y: bbox.y0 } })));

const area = (b: ResidualEntry['bbox']): number => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
const contains = (o: ResidualEntry['bbox'], i: ResidualEntry['bbox']): boolean =>
  o.x0 <= i.x0 && o.y0 <= i.y0 && o.x1 >= i.x1 && o.y1 >= i.y1;

describe('Property 27: residual attribution', () => {
  it('is total, picks the smallest containing entry and ignores the register order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        genRegions,
        fc.array(genEntry, { maxLength: 10 }),
        fc.array(fc.nat(), { minLength: 10, maxLength: 10 }),
        (frame, regions, entries, rnd) => {
          const reg = { formatVersion: 1 as const, sample: 's', entries };
          const out = attributeRegions(frame, regions, reg);
          expect(out).toHaveLength(regions.length);
          out.forEach((a, i) => {
            expect(a.region).toBe(regions[i]);
            expect(a.frame).toBe(frame);
            const cands = entries.filter((e) => e.frame === frame && contains(e.bbox, regions[i]!.bbox));
            if (cands.length === 0) {
              expect(a.entry).toBeNull();
            } else {
              expect(a.entry).not.toBeNull();
              expect(cands).toContain(a.entry);
              expect(area(a.entry!.bbox)).toBe(Math.min(...cands.map((c) => area(c.bbox))));
            }
          });
          const shuffled = entries
            .map((e, i) => ({ e, k: rnd[i % rnd.length]! }))
            .sort((p, q) => p.k - q.k)
            .map((p) => p.e);
          const out2 = attributeRegions(frame, regions, { ...reg, entries: shuffled });
          expect(out2.map((a) => a.entry)).toEqual(out.map((a) => a.entry));
          expect(residualLimits(out2)).toEqual(residualLimits(out));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('validateResidualRegister rejects each bad field and names it', () => {
    const stage = { width: N, height: N };
    const base = (e: Partial<ResidualEntry> | Record<string, unknown>): unknown => ({
      formatVersion: 1,
      sample: 's',
      entries: [{ frame: 0, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, kind: 'ok', message: 'real cause', ...e }],
    });
    const field = (x: unknown): string | null => {
      try {
        validateResidualRegister(x, stage);
        return null;
      } catch (err) {
        expect(err).toBeInstanceOf(ResidualRegisterError);
        return (err as Error).message.split(':')[0]!;
      }
    };
    expect(field(base({}))).toBeNull();
    fc.assert(
      fc.property(
        fc.constantFrom('unknown', 'not examined', 'todo', 'tbd'),
        fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
        fc.constantFrom('', ' '),
        (word, flips, pad) => {
          const cased = [...word].map((ch, i) => (flips[i] ? ch.toUpperCase() : ch)).join('');
          expect(field(base({ message: pad + cased + pad }))).toBe('entries[0].message');
        },
      ),
    );
    fc.assert(
      fc.property(fc.constantFrom('', 'A', '1a', 'a b', 'a_b', '-a'), (kind) => {
        expect(field(base({ kind }))).toBe('entries[0].kind');
      }),
    );
    fc.assert(
      fc.property(fc.oneof(fc.double({ min: 0.1, max: 0.9, noNaN: true }), fc.constant(NaN), fc.constant('1')), (frame) => {
        expect(field(base({ frame }))).toBe('entries[0].frame');
      }),
    );
    expect(field(base({ message: '' }))).toBe('entries[0].message');
    fc.assert(
      fc.property(
        fc.constantFrom('x0', 'y0', 'x1', 'y1'),
        fc.oneof(fc.integer({ min: N, max: N + 50 }), fc.integer({ min: -50, max: -1 })),
        (key, v) => {
          const bbox = { x0: 0, y0: 0, x1: 1, y1: 1, [key]: v };
          expect(field(base({ bbox }))).toBe(`entries[0].bbox.${key}`);
        },
      ),
    );
  });
});
