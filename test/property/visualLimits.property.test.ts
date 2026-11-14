// Property 9: Visual limits are complete, ordered and deduplicated.
// **Validates: Requirements 2.2, 2.3, 2.7, 10.5, 13.6**
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { knownVisualLimits } from '../../src/verify/core/limits';
import type { SceneJson } from '../../template/runtime/scene';
import type { UnsupportedFeatureEntry } from '../../src/pipeline/unsupported';

const scene = { formatVersion: 2, stage: { width: 1, height: 1, backgroundColor: '#ffffff', frameRate: 30 }, rootSymbolId: 0, symbols: {} } as unknown as SceneJson;
const OWN = ['gradient-fill', 'gradient-spread', 'gradient-focal', 'bitmap-fill', 'bitmap-smoothing', 'text-metrics', 'stroke-style', 'blend-mode'];
const PLAIN = ['text', 'button', 'filter', 'mask', 'video', 'morph-shape'];
const OTHER = ['sound', 'unbound-instance', 'untranslated-class', 'class-omitted', 'as3-interface', 'untranslated-code', 'other-tag'];
const genEntry: fc.Arbitrary<UnsupportedFeatureEntry> = fc
  .record(
    {
      kind: fc.constantFrom(...OWN, ...PLAIN, ...OTHER),
      message: fc.constantFrom('a', 'b', 'c<d>'),
      id: fc.integer({ min: 0, max: 3 }),
    },
    { requiredKeys: ['kind', 'message'] },
  )
  .map((e) => e as unknown as UnsupportedFeatureEntry);
const key = (l: { kind: string; id?: number; message: string }): string => JSON.stringify([l.kind, l.id ?? null, l.message]);
const expectedKeys = (es: UnsupportedFeatureEntry[], exact: boolean): string[] => {
  const keys = new Set<string>();
  for (const e of es) {
    const k = e.kind as string;
    if (k === 'text-metrics' && exact) continue;
    if (OWN.includes(k)) keys.add(key({ kind: k, id: e.id, message: e.message }));
    else if (PLAIN.includes(k)) keys.add(key({ kind: 'unsupported-feature', id: e.id, message: e.message }));
  }
  return [...keys].sort();
};

describe('Property 9: visual limits', () => {
  it('has one limit per relevant entry, no duplicates, text-metrics omitted exactly when exact', () => {
    fc.assert(
      fc.property(fc.array(genEntry, { maxLength: 12 }), fc.boolean(), (es, exact) => {
        const out = knownVisualLimits(scene, es, { allComparedFramesExact: exact });
        expect(out.map(key).sort()).toEqual(expectedKeys(es, exact));
        expect(new Set(out.map(key)).size).toBe(out.length);
        expect(out.some((l) => l.kind === 'text-metrics')).toBe(!exact && es.some((e) => (e.kind as string) === 'text-metrics'));
      }),
    );
  });
  it('gives the same sorted list for every permutation', () => {
    fc.assert(
      fc.property(
        fc.array(genEntry, { maxLength: 12 }).chain((es) => fc.tuple(fc.constant(es), fc.shuffledSubarray(es, { minLength: es.length, maxLength: es.length }))),
        fc.boolean(),
        ([es, shuffled], exact) => {
          const o = { allComparedFramesExact: exact };
          expect(knownVisualLimits(scene, shuffled, o)).toEqual(knownVisualLimits(scene, es, o));
        },
      ),
    );
  });
});