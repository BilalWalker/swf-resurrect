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
