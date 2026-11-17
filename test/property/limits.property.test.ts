import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyError } from '../../src/outcome/classifyError';
import { decideOutcome } from '../../src/outcome/outcome';
import type { OutcomeLimits, StageName } from '../../src/outcome/outcome';
import { createGuard, TimeLimitError } from '../../src/pipeline/guard';
import {
  defaultLimits,
  ENV_MAX_SIZE,
  ENV_RUN_LIMIT,
  ENV_STAGE_LIMIT,
  resolveLimits,
  stageAllowanceS,
} from '../../src/pipeline/limits';
import { createFakeClock } from '../support/fakeClock';
import { fcConfig } from './config';

// Feature: robustness, Property 11: Limit resolution
// **Validates: Requirements 6.1, 6.8, 6.13**
const posInt = fc.integer({ min: 1, max: 100000 }).map(String);
const badValue = fc.oneof(
  fc.constantFrom('0', '-1', '1.5', '1e3', '', ' 5', '5 ', 'abc', '0x10', '+3', '007', 'NaN', '99999999999999999999'),
  fc.integer({ min: -1000, max: 0 }).map(String),
);
const maybe = (v: fc.Arbitrary<string>) => fc.option(v, { nil: undefined });

describe('Property 11: Limit resolution', () => {
  it('uses the option, else the variable, else the default, for each of the three limits', () => {
    fc.assert(
      fc.property(
        maybe(posInt), maybe(posInt), maybe(posInt),
        maybe(posInt), maybe(posInt), maybe(posInt),
        (o1, o2, o3, e1, e2, e3) => {
          const r = resolveLimits({
            options: { maxSize: o1, runLimit: o2, stageLimit: o3 },
            env: { [ENV_MAX_SIZE]: e1, [ENV_RUN_LIMIT]: e2, [ENV_STAGE_LIMIT]: e3 },
          });
          const d = defaultLimits();
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(r.limits.maxSizeMiB).toBe(Number(o1 ?? e1 ?? d.maxSizeMiB));
          expect(r.limits.runLimitS).toBe(Number(o2 ?? e2 ?? d.runLimitS));
          expect(r.limits.stageLimitS).toBe(Number(o3 ?? e3 ?? d.stageLimitS));
          expect(r.limits.stageWeights).toEqual(d.stageWeights);
        },
      ),
      fcConfig,
    );
  });

  it('yields a usage error, never a limit, when a value given is not a positive integer', () => {
    fc.assert(
      fc.property(
        badValue, fc.constantFrom(0, 1, 2, 3, 4, 5), maybe(posInt), maybe(posInt), maybe(posInt),
        (bad, slot, a, b, c) => {
          const vals: (string | undefined)[] = [a, b, c, a, b, c];
          vals[slot] = bad;
          const r = resolveLimits({
            options: { maxSize: vals[0], runLimit: vals[1], stageLimit: vals[2] },
            env: { [ENV_MAX_SIZE]: vals[3], [ENV_RUN_LIMIT]: vals[4], [ENV_STAGE_LIMIT]: vals[5] },
          });
          // A bad variable behind a valid option of the same limit is never read (the option wins).
          const ignored = slot >= 3 && vals[slot - 3] !== undefined;
          expect(r.ok).toBe(ignored);
          if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
        },
      ),
      fcConfig,
    );
  });
});

// Feature: robustness, Property 12: Time limit if and only if a duration exceeds its allowance
// **Validates: Requirements 6.5, 6.10, 6.12, 6.13, 10.4**
const STAGES: StageName[] = ['recover', 'unpack', 'convert', 'translate', 'emit', 'gate', 'verify'];
const flush = () => new Promise<void>((r) => setImmediate(r));

describe('Property 12: Time limit if and only if a duration exceeds its allowance', () => {
  it('refuses time-limit exactly when a duration passes its allowance or the sum passes the run limit', async () => {
    // Durations are 1000k + 300 ms and never equal a whole-second budget or a remaining run time (at most 7 stages).
    const duration = fc.integer({ min: 0, max: 400 }).map((k) => k * 1000 + 300);
    await fc.assert(
      fc.asyncProperty(
        fc.array(duration, { minLength: 7, maxLength: 7 }),
        fc.integer({ min: 1, max: 100 }),
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 7, maxLength: 7 }),
        fc.integer({ min: 1, max: 1500 }),
        async (durations, stageLimitS, weights, runLimitS) => {
          const limits: OutcomeLimits = {
            maxSizeMiB: 20,
            runLimitS,
            stageLimitS,
            stageWeights: Object.fromEntries(STAGES.map((s, i) => [s, weights[i]])),
          };
          // Model.
          let elapsed = 0;
          let expected: { stage: StageName; limit: string } | null = null;
          for (let i = 0; i < STAGES.length && expected === null; i++) {
            const allowanceS = stageAllowanceS(limits, STAGES[i]);
            const remainingMs = runLimitS * 1000 - elapsed;
            const runApplies = remainingMs < allowanceS * 1000;
            const budgetMs = runApplies ? remainingMs : allowanceS * 1000;
            if (durations[i] > budgetMs || remainingMs <= 0) {
              expected = { stage: STAGES[i], limit: runApplies ? `${runLimitS} s run limit` : `${allowanceS} s stage limit` };
            }
            elapsed += durations[i];
          }

          const clock = createFakeClock();
          const guard = createGuard({ clock, limits, killAll: async () => undefined });
          let caught: unknown = null;
          for (let i = 0; i < STAGES.length && caught === null; i++) {
            const d = durations[i];
            const p = guard.runStage(STAGES[i], () => new Promise<string>((res) => void clock.setTimeout(() => res('ok'), d)));
            const settled = p.then(() => null, (e: unknown) => e);
            await flush();
            clock.advance(d);
            caught = await settled;
          }

          if (expected === null) {
            expect(caught).toBeNull();
            expect(guard.records.every((r) => r.result === 'ok')).toBe(true);
          } else {
            expect(caught).toBeInstanceOf(TimeLimitError);
            expect(caught).toMatchObject(expected);
            const failure = classifyError(caught, expected.stage);
            const d = decideOutcome({ facts: null, stages: guard.records, failure, numbers: null, gaps: [], limits: guard.limits, recovery: null });
            expect(d).toMatchObject({ outcome: 'refused', reasonCode: 'time-limit', exitCode: 3 });
            expect(d.reason).toContain(expected.stage);
            expect(d.reason).toContain(expected.limit);
          }
          expect(guard.limits).toEqual(limits);
        },
      ),
      fcConfig,
    );
  });
});
