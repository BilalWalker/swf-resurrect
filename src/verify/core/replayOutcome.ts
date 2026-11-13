// Behaviour decision (breadth task 7.8, design sections 20.3 and 20.4). Pure.
// One function decides how a Replay observation and a Reference_Trace become a behaviour result.
import type { Problem } from './report';
import { sanitizeDetail } from './sanitize';
import { compareTraces, type TraceComparison } from './traceCompare';

export interface ReplayObservation {
  lines: readonly string[];
  ticksRun: number;
  error: { tick: number; message: string } | null;
  /** True when the child could not run (start, timeout, no result file) or `deps.replay` rejected. */
  childFailure: boolean;
}

export type BehaviourDecision =
  | {
      status: 'not-compared';
      reason: 'replay-failed' | 'trace-too-large' | 'empty-reference-trace';
      problem: Problem | null;
    }
  | {
      status: 'compared';
      comparison: Extract<TraceComparison, { kind: 'compared' }>;
      ticksRun: number;
      problem: Problem | null;
    };

/** One Caught_Error as the Replay runner records it (design 21.3, Requirement 25.7). */
export interface CaughtErrorRecord {
  tick: number;
  site: string;
  message: string;
}

/** Most `runtime-error` Problems listed; the rest become one `runtime-error-overflow` Problem (D28). */
export const RUNTIME_ERROR_CAP = 100;
/** How many Caught_Errors `behaviour.replay.caughtErrors.first` holds. */
export const CAUGHT_ERRORS_FIRST = 20;

function byTick(caught: readonly CaughtErrorRecord[]): CaughtErrorRecord[] {
  return caught
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.tick - b.c.tick || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Problems for the Caught_Errors, sorted by (tick, order of occurrence), at most `cap` of kind
 * `runtime-error` and one `runtime-error-overflow` naming the count left out. `index` is the position in
 * that order, so the report's own Problem sort (kind, then index) keeps it.
 */
export function runtimeErrorProblems(caught: readonly CaughtErrorRecord[], cap: number = RUNTIME_ERROR_CAP): Problem[] {
  const sorted = byTick(caught);
  const out: Problem[] = sorted.slice(0, cap).map((c, i) => ({
    kind: 'runtime-error',
    tick: c.tick,
    index: i,
    detail: sanitizeDetail(`${c.site}: ${c.message}`),
  }));
  if (sorted.length > cap) {
    out.push({ kind: 'runtime-error-overflow', detail: `${sorted.length - cap} more Caught_Errors not listed` });
  }
  return out;
}

/** `behaviour.replay.caughtErrors`: the count and the first 20 in (tick, occurrence) order. */
export function summariseCaughtErrors(caught: readonly CaughtErrorRecord[]): {
  count: number;
  first: CaughtErrorRecord[];
} {
  return {
    count: caught.length,
    first: byTick(caught)
      .slice(0, CAUGHT_ERRORS_FIRST)
      .map((c) => ({ tick: c.tick, site: sanitizeDetail(c.site), message: sanitizeDetail(c.message) })),
  };
}

function errorProblem(error: { tick: number; message: string }): Problem {
  return { kind: 'replay-error', tick: error.tick, detail: sanitizeDetail(error.message) };
}

/** `obs` is null when no Replay was run. */
export function decideBehaviour(referenceLines: readonly string[], obs: ReplayObservation | null): BehaviourDecision {
  const problem = obs !== null && obs.error !== null ? errorProblem(obs.error) : null;

  // An Empty_Reference_Trace is decided first: nothing can be compared, captured lines are discarded.
  if (referenceLines.length === 0) {
    return { status: 'not-compared', reason: 'empty-reference-trace', problem };
  }
  if (obs === null) {
    return { status: 'not-compared', reason: 'replay-failed', problem: null };
  }
  if (obs.error !== null && obs.childFailure) {
    return { status: 'not-compared', reason: 'replay-failed', problem };
  }
  const comparison = compareTraces(referenceLines, obs.lines);
  if (comparison.kind === 'too-large') {
    return { status: 'not-compared', reason: 'trace-too-large', problem };
  }
  return { status: 'compared', comparison, ticksRun: obs.ticksRun, problem };
}
