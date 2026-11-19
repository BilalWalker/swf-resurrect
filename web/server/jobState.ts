// Job state machine: folds parsed pipeline lines and process events into what the UI shows.
// Pure: every function returns a new state and never reads a clock or the file system.
import type { JobOutcome, OutcomeRead } from './outcome';
import { ALL_STAGES, isPipelineStage } from './stageLines';
import type { Facts, ParsedLine, StageKey } from './stageLines';

/** `refused`: the stage where the engine declined the input; not a failure, so never shown red. */
export type StageStatus = 'pending' | 'running' | 'ok' | 'warn' | 'failed' | 'refused' | 'skipped';
/**
 * `refused`: the engine declined the input (exit 3, Outcome `refused`); it is not an error of the
 * server. `succeeded` covers both project outcomes (`converted`, `converted-with-gaps`).
 */
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'refused' | 'failed';

export interface StageState {
  key: StageKey;
  status: StageStatus;
  /** The text the CLI printed in parentheses (or after the colon), verbatim; null when none. */
  detail: string | null;
  facts: Facts;
}

export interface JobWarning {
  stage: string;
  message: string;
}

export interface JobError {
  /** The stage shown as failed. */
  stage: StageKey;
  /** The stage name the CLI printed (`pipeline` for some failures), or null when it printed none. */
  reportedStage: string | null;
  message: string;
}

export interface JobState {
  status: JobStatus;
  stages: StageState[];
  warnings: JobWarning[];
  error: JobError | null;
  verifyNotes: string[];
  /** The Outcome_File read after the pipeline ended; null before that, or when there was none. */
  outcome: JobOutcome | null;
}

export function initialState(): JobState {
  return {
    status: 'queued',
    stages: ALL_STAGES.map((key) => ({ key, status: 'pending', detail: null, facts: {} })),
    warnings: [],
    error: null,
    verifyNotes: [],
    outcome: null,
  };
}

function withStage(state: JobState, key: StageKey, patch: Partial<StageState>): JobState {
  return { ...state, stages: state.stages.map((s) => (s.key === key ? { ...s, ...patch } : s)) };
}

/** The running stage, or null. */
export function currentStage(state: JobState): StageKey | null {
  return state.stages.find((s) => s.status === 'running')?.key ?? null;
}

/** Marks `key` done and the next pending stage running (stops before `build`). */
function complete(state: JobState, key: StageKey, patch: Partial<StageState>): JobState {
  let next = withStage(state, key, patch);
  // Stages are strictly ordered; anything still running before this one finished silently.
  const idx = ALL_STAGES.indexOf(key);
  for (const s of next.stages.slice(0, idx)) {
    if (s.status === 'running' || s.status === 'pending') next = withStage(next, s.key, { status: 'ok' });
  }
  const following = next.stages[idx + 1];
  if (following !== undefined && following.status === 'pending' && following.key !== 'build') {
    next = withStage(next, following.key, { status: 'running' });
  }
  return next;
}

export function start(state: JobState): JobState {
  if (state.status !== 'queued') return state;
  return withStage({ ...state, status: 'running' }, 'unpack', { status: 'running' });
}

function fail(state: JobState, reportedStage: string | null, message: string): JobState {
  const stage: StageKey =
    reportedStage !== null && isPipelineStage(reportedStage) ? reportedStage : (currentStage(state) ?? 'unpack');
  let next: JobState = { ...state, status: 'failed', error: { stage, reportedStage, message } };
  next = withStage(next, stage, { status: 'failed' });
  for (const s of next.stages) {
    if (s.status === 'pending' || s.status === 'running') next = withStage(next, s.key, { status: 'skipped' });
  }
  return next;
}

export function applyLine(state: JobState, line: ParsedLine): JobState {
  if (state.status !== 'running') return state;
  switch (line.type) {
    case 'stage-ok':
      return complete(state, line.stage, { status: 'ok', detail: line.detail, facts: line.facts });
    case 'typecheck-errors':
      // Type errors are reported, not fatal: the project is still emitted.
      return complete(state, 'typecheck', {
        status: 'warn',
        detail: `${line.count} error${line.count === 1 ? '' : 's'}: ${line.detail}`,
        facts: { errors: line.count },
      });
    case 'verify': {
      const facts = { overallMatch: line.overallMatch, traceScore: line.traceScore };
      const pct = (v: number | null): string => (v === null ? 'not compared' : `${v.toFixed(2)}%`);
      return complete(state, 'verify', {
        status: 'ok',
        detail: `overall match ${pct(line.overallMatch)}, trace score ${pct(line.traceScore)}`,
        facts,
      });
    }
    case 'verify-trace': {
      const v = state.stages.find((s) => s.key === 'verify');
      if (v === undefined) return state;
      return withStage(state, 'verify', { facts: { ...v.facts, missing: line.missing, extra: line.extra } });
    }
    case 'verify-note':
      return { ...state, verifyNotes: [...state.verifyNotes, line.text] };
    case 'warn':
      return { ...state, warnings: [...state.warnings, { stage: line.stage, message: line.message }] };
    case 'error':
      return fail(state, line.stage, line.message);
    case 'done':
    case 'log':
      return state;
  }
}

/** Exit codes of the pipeline CLI (docs/outcome.md). */
const EXIT_PROJECT = 0;
const EXIT_REFUSED = 3;

/**
 * The pipeline process ended. `reason` describes an end the server caused (its own time limit,
 * spawn failure, shutdown); it wins over everything else. Otherwise the Outcome_File decides:
 * exit 0 with a project outcome starts the `build` stage, exit 3 with `refused` ends the job as
 * refused, and anything else is failed. A missing or unreadable file after exit 0 or 3 is failed
 * with the reader's plain sentence. Lines such as `error [unpack]: ...` printed before the end
 * only mark the stage; they do not decide the status once an Outcome_File was read.
 */
export function pipelineExited(state: JobState, exitCode: number | null, reason?: string, read?: OutcomeRead): JobState {
  if (state.status !== 'running' && state.status !== 'failed') return state;
  if (state.status === 'failed' && state.outcome !== null) return state;
  const outcome = read?.ok === true ? read.outcome : null;
  const withOutcome: JobState = { ...state, outcome };
  if (reason !== undefined) return state.status === 'failed' ? withOutcome : fail(withOutcome, null, reason);
  const skipRest = (s: JobState, keep: StageKey | null): JobState => {
    let next = s;
    for (const st of next.stages) {
      if (st.key === keep) continue;
      if (st.status === 'running' || st.status === 'pending') next = withStage(next, st.key, { status: 'skipped' });
    }
    return next;
  };
  if (exitCode === EXIT_PROJECT && (outcome?.outcome === 'converted' || outcome?.outcome === 'converted-with-gaps')) {
    if (state.status === 'failed') return withOutcome;
    return withStage(skipRest(withOutcome, 'build'), 'build', { status: 'running' });
  }
  if (exitCode === EXIT_REFUSED && outcome?.outcome === 'refused') {
    // The stage an error line marked failed, else the one running, is where the engine refused.
    const at = withOutcome.stages.find((s) => s.status === 'failed') ?? withOutcome.stages.find((s) => s.status === 'running');
    const marked = at === undefined ? withOutcome : withStage(withOutcome, at.key, { status: 'refused' });
    return skipRest({ ...marked, status: 'refused', error: null }, null);
  }
  if (state.status === 'failed') {
    // The engine's own sentence replaces the raw line it printed before ending.
    if (outcome?.outcome !== 'failed' || withOutcome.error === null) return withOutcome;
    return { ...withOutcome, error: { ...withOutcome.error, message: outcome.reason } };
  }
  if ((exitCode === EXIT_PROJECT || exitCode === EXIT_REFUSED) && read?.ok === false) return fail(withOutcome, null, read.message);
  if (outcome?.outcome === 'failed') return fail(withOutcome, null, outcome.reason);
  return fail(withOutcome, null, `the pipeline exited with code ${exitCode ?? 'unknown'}`);
}

/** The preview build ended. A build failure keeps the pipeline result; only the preview is missing. */
export function buildFinished(state: JobState, error: string | null): JobState {
  if (state.status !== 'running') return state;
  if (error === null) return { ...withStage(state, 'build', { status: 'ok' }), status: 'succeeded' };
  return { ...withStage(state, 'build', { status: 'failed', detail: error }), status: 'succeeded' };
}

/** A queued or running job that will not finish normally (server stopping, timeout before start). */
export function abort(state: JobState, message: string): JobState {
  if (state.status === 'succeeded' || state.status === 'refused' || state.status === 'failed') return state;
  if (state.status === 'queued') state = start(state);
  return fail(state, null, message);
}
