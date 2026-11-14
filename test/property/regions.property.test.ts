// Property 26: Region clustering partitions the mask deterministically.
// **Validates: Requirements 21.1, 21.4**
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { clusterDiffRegions, regionTable } from '../../src/verify/core/regions';

interface M {
  w: number;
  h: number;
  mask: Uint8Array;
}

const genMask: fc.Arbitrary<M> = fc
  .record({
    w: fc.integer({ min: 0, max: 14 }),
    h: fc.integer({ min: 0, max: 14 }),
    density: fc.constantFrom(0, 0.1, 0.3, 0.5, 1),
    seed: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 196, maxLength: 196 }),
  })
  .map(({ w, h, density, seed }) => {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = seed[i] < density ? 1 : 0;
    return { w, h, mask };
  });

const genThin: fc.Arbitrary<M> = fc
  .record({ n: fc.integer({ min: 1, max: 12 }), horizontal: fc.boolean(), diagonal: fc.boolean() })
  .map(({ n, horizontal, diagonal }) => {
    if (diagonal) {
      const mask = new Uint8Array(n * n);
      for (let i = 0; i < n; i++) mask[i * n + i] = 1;
      return { w: n, h: n, mask };
    }
    const mask = new Uint8Array(n).fill(1);
    return horizontal ? { w: n, h: 1, mask } : { w: 1, h: n, mask };
  });

const genAny = fc.oneof(genMask, genThin);

function transpose(m: M): M {
  const mask = new Uint8Array(m.mask.length);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) mask[x * m.h + y] = m.mask[y * m.w + x];
  return { w: m.h, h: m.w, mask };
}

describe('Property 26: clusterDiffRegions partitions the mask', () => {
  it('counts add up, boxes are tight, regions are separated, ids are canonical', () => {
    fc.assert(
      fc.property(genAny, ({ w, h, mask }) => {
        const regions = clusterDiffRegions(mask, w, h);
        const marked = mask.reduce((a, b) => a + b, 0);
        expect(regions.reduce((a, r) => a + r.pixels, 0)).toBe(marked);

        const owner = new Int32Array(mask.length);
        regions.forEach((r, k) => expect(r.id).toBe(k + 1));

        // Independent labelling by repeated relaxation to check membership and separation.
        const label = new Int32Array(mask.length);
        let next = 0;
        for (let i = 0; i < mask.length; i++) if (mask[i] === 1) label[i] = ++next;
        let changed = true;
        while (changed) {
          changed = false;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = y * w + x;
              if (mask[i] !== 1) continue;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const nx = x + dx, ny = y + dy;
                  if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                  const j = ny * w + nx;
                  if (mask[j] === 1 && label[j] < label[i]) {
                    label[i] = label[j];
                    changed = true;
                  }
                }
              }
            }
          }
        }
        // Group pixels by label in raster order: groups must equal the regions in order.
        const groups = new Map<number, number[]>();
        for (let i = 0; i < mask.length; i++) {
          if (mask[i] !== 1) continue;
          const g = groups.get(label[i]) ?? [];
          g.push(i);
          groups.set(label[i], g);
        }
        const list = [...groups.values()].sort((a, b) => a[0] - b[0]);
        expect(list.length).toBe(regions.length);
        list.forEach((px, k) => {
          const r = regions[k];
          expect(r.pixels).toBe(px.length);
          expect(r.first).toEqual({ x: px[0] % w, y: Math.floor(px[0] / w) });
          const xs = px.map((i) => i % w);
          const ys = px.map((i) => Math.floor(i / w));
          expect(r.bbox).toEqual({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
          for (const i of px) owner[i] = r.id;
        });
        for (let i = 0; i < mask.length; i++) expect(owner[i] !== 0).toBe(mask[i] === 1);
      }),
      { numRuns: 100 },
    );
  });

  it('is deterministic and transposes', () => {
    fc.assert(
      fc.property(genAny, (m) => {
        const a = clusterDiffRegions(m.mask, m.w, m.h);
        expect(clusterDiffRegions(m.mask, m.w, m.h)).toEqual(a);
        const t = transpose(m);
        const b = clusterDiffRegions(t.mask, t.w, t.h);
        const norm = (rs: typeof a, swap: boolean): string[] =>
          rs
            .map((r) =>
              JSON.stringify(
                swap
                  ? [r.bbox.y0, r.bbox.x0, r.bbox.y1, r.bbox.x1, r.pixels]
                  : [r.bbox.x0, r.bbox.y0, r.bbox.x1, r.bbox.y1, r.pixels],
              ),
            )
            .sort();
        expect(norm(b, true)).toEqual(norm(a, false));
      }),
      { numRuns: 100 },
    );
  });

  it('regionTable rows and aggregate add up', () => {
    fc.assert(
      fc.property(genAny, fc.integer({ min: 0, max: 8 }), (m, k) => {
        const regions = clusterDiffRegions(m.mask, m.w, m.h);
        const t = regionTable(regions, k);
        expect(t.rows).toEqual(regions.slice(0, k));
        expect(t.omitted.regions).toBe(Math.max(0, regions.length - k));
        const total = regions.reduce((a, r) => a + r.pixels, 0);
        expect(t.rows.reduce((a, r) => a + r.pixels, 0) + t.omitted.pixels).toBe(total);
      }),
      { numRuns: 100 },
    );
  });

  it('throws RangeError when the length differs and handles a full 550x400 mask', () => {
    expect(() => clusterDiffRegions(new Uint8Array(5), 2, 2)).toThrow(RangeError);
    expect(clusterDiffRegions(new Uint8Array(0), 0, 0)).toEqual([]);
    const full = new Uint8Array(550 * 400).fill(1);
    const r = clusterDiffRegions(full, 550, 400);
    expect(r).toEqual([{ id: 1, bbox: { x0: 0, y0: 0, x1: 549, y1: 399 }, pixels: 220000, first: { x: 0, y: 0 } }]);
  });
});
