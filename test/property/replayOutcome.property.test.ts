import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideBehaviour, runtimeErrorProblems, summariseCaughtErrors } from '../../src/verify/core/replayOutcome';

const line = fc.string({ minLength: 1, maxLength: 6 });
const lines = fc.array(line, { maxLength: 12 });
const nonEmptyLines = fc.array(line, { minLength: 1, maxLength: 12 });
const caught = fc.record({ tick: fc.integer({ min: 0, max: 50 }), message: fc.string({ maxLength: 20 }) });

describe('Property 41: A Replay that throws keeps the lines it captured', () => {
  /** **Validates: Requirements 14.19, 14.22** */
  it('a caught error is compared in full with one replay-error', () => {
    fc.assert(
      fc.property(nonEmptyLines, lines, caught, fc.nat(100), (ref, cap, error, ticksRun) => {
        const d = decideBehaviour(ref, { lines: cap, ticksRun, error, childFailure: false });
        expect(d.status).toBe('compared');
        if (d.status !== 'compared') return;
        const c = d.comparison;
        expect(c.matched + c.missing.length).toBe(ref.length);
        expect(c.matched + c.extra.length).toBe(cap.length);
        expect(d.problem?.kind).toBe('replay-error');
        expect(d.problem?.tick).toBe(error.tick);
        expect(d.ticksRun).toBe(ticksRun);
      }),
    );
  });

  /** **Validates: Requirements 14.22** */
  it('a captured prefix leaves exactly the unreached lines missing, in order, 1-based', () => {
    fc.assert(
      fc.property(nonEmptyLines, fc.nat(12), caught, (ref, n, error) => {
        const cap = ref.slice(0, Math.min(n, ref.length));
        const d = decideBehaviour(ref, { lines: cap, ticksRun: 0, error, childFailure: false });
        if (d.status !== 'compared') throw new Error('expected compared');
        expect(d.comparison.extra).toEqual([]);
        expect(d.comparison.missing.map((m) => m.line)).toEqual(
          ref.map((_, i) => i + 1).slice(cap.length),
        );
        expect(d.comparison.traceScore).toBe(Math.round((10000 * cap.length) / ref.length) / 100);
      }),
    );
  });

  /** **Validates: Requirements 14.22** */
  it('a child failure is not-compared: replay-failed with one replay-error', () => {
    fc.assert(
      fc.property(nonEmptyLines, lines, caught, (ref, cap, error) => {
        const d = decideBehaviour(ref, { lines: cap, ticksRun: 0, error, childFailure: true });
        expect(d.status).toBe('not-compared');
        if (d.status === 'not-compared') expect(d.reason).toBe('replay-failed');
        expect(d.problem?.kind).toBe('replay-error');
      }),
    );
  });

  /** **Validates: Requirements 14.24** */
  it('an empty reference is never compared; a replay-error exactly when the observation has an error', () => {
    fc.assert(
      fc.property(
        lines,
        fc.option(caught, { nil: null }),
        fc.boolean(),
        fc.boolean(),
        (cap, error, childFailure, hasObs) => {
          const d = decideBehaviour([], hasObs ? { lines: cap, ticksRun: 1, error, childFailure } : null);
          expect(d.status).toBe('not-compared');
          if (d.status === 'not-compared') expect(d.reason).toBe('empty-reference-trace');
          expect(d.problem !== null).toBe(hasObs && error !== null);
        },
      ),
    );
  });

  it('no error compares as before', () => {
    fc.assert(
      fc.property(nonEmptyLines, lines, (ref, cap) => {
        const d = decideBehaviour(ref, { lines: cap, ticksRun: 3, error: null, childFailure: false });
        expect(d.status).toBe('compared');
        expect(d.problem).toBeNull();
      }),
    );
  });
});

describe('Property 48: The Replay records every caught error with its tick and keeps ticking', () => {
  const record = fc.record({ tick: fc.integer({ min: 0, max: 40 }), site: fc.string({ minLength: 1, maxLength: 8 }), message: fc.string({ maxLength: 8 }) });

  /** **Validates: Requirements 25.7, 25.11** */
  it('one runtime-error per throw up to the cap, sorted by tick then occurrence, then one overflow', () => {
    fc.assert(
      fc.property(fc.array(record, { maxLength: 150 }), fc.integer({ min: 1, max: 120 }), (caught, cap) => {
        const ps = runtimeErrorProblems(caught, cap);
        const listed = ps.filter((p) => p.kind === 'runtime-error');
        expect(listed.length).toBe(Math.min(caught.length, cap));
        const ticks = listed.map((p) => p.tick as number);
        expect(ticks).toEqual([...caught.map((c) => c.tick)].sort((a, b) => a - b).slice(0, cap));
        expect(listed.map((p) => p.index)).toEqual(listed.map((_, i) => i));
        const over = ps.filter((p) => p.kind === 'runtime-error-overflow');
        expect(over.length).toBe(caught.length > cap ? 1 : 0);
        if (over.length === 1) expect(over[0]?.detail).toBe(`${caught.length - cap} more Caught_Errors not listed`);
      }),
    );
  });

  /** **Validates: Requirements 25.7, 25.8** */
  it('the summary counts all and keeps the first 20 by tick; no error changes the decision', () => {
    fc.assert(
      fc.property(fc.array(record, { maxLength: 60 }), nonEmptyLines, lines, (caught, ref, cap) => {
        const s = summariseCaughtErrors(caught);
        expect(s.count).toBe(caught.length);
        expect(s.first.length).toBe(Math.min(20, caught.length));
        const ticks = s.first.map((c) => c.tick);
        expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
        const d = decideBehaviour(ref, { lines: cap, ticksRun: 7, error: null, childFailure: false });
        expect(d.problem).toBeNull();
        expect(d.status).toBe('compared');
      }),
    );
  });
});
