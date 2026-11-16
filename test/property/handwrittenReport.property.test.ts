import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyOverrides } from '../../src/pipeline/handwrittenSet';
import { buildReport } from '../../src/translate/report';
import { fcConfig } from './config';

// Feature: as3-coverage, Property 27: Overrides outside the set are reported
describe('Property 27: Overrides outside the set are reported', () => {
  const name = fc.stringMatching(/^[A-Z][A-Za-z]{0,5}(\.[A-Z][A-Za-z]{0,5}){0,2}$/);
  const sample = fc.constantFrom('s1', 's2', 's3');

  it('warns for exactly the overrides that are not listed and lists the others with their reason', () => {
    // **Validates: Requirements 33.3, 33.4, 33.5**
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.record({ sample, className: name, reason: fc.string({ minLength: 1, maxLength: 10 }) }), { selector: (e) => `${e.sample}/${e.className}`, maxLength: 8 }),
        sample,
        fc.uniqueArray(name, { maxLength: 8 }),
        fc.uniqueArray(name, { maxLength: 8 }),
        (set, current, overrides, translated) => {
          const { listed, unlisted } = classifyOverrides(current, overrides, set, new Set(translated));
          const inSet = new Map(set.filter((e) => e.sample === current).map((e) => [e.className, e.reason]));
          expect(unlisted).toEqual(overrides.filter((c) => !inSet.has(c)).sort());
          expect(listed.map((l) => [l.className, l.reason])).toEqual(
            overrides.filter((c) => inSet.has(c)).sort().map((c) => [c, inSet.get(c)]),
          );
          for (const l of listed) expect(l.replacesTranslated).toBe(translated.includes(l.className));
          // The report carries the listed entries and nothing else.
          expect(buildReport([], null, { handwritten: listed }).handwritten ?? []).toEqual(listed);
        },
      ),
      fcConfig,
    );
  });
});
