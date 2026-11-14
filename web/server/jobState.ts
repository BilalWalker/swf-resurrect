// Job state machine: folds parsed pipeline lines and process events into what the UI shows.
// Pure: every function returns a new state and never reads a clock or the file system.
import { ALL_STAGES, isPipelineStage } from './stageLines';
import type { Facts, ParsedLine, StageKey } from './stageLines';

export type StageStatus = 'pending' | 'running' | 'ok' | 'warn' | 'failed' | 'skipped';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

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
}

export function initialState(): JobState {
  return {
    status: 'queued',
    stages: ALL_STAGES.map((key) => ({ key, status: 'pending', detail: null, facts: {} })),
    warnings: [],
    error: null,
    verifyNotes: [],
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

/**
 * The pipeline process ended. `reason` describes an abnormal end (timeout, spawn failure) and is
 * used when the CLI printed no error line of its own. On success the `build` stage starts.
 */
export function pipelineExited(state: JobState, exitCode: number | null, reason?: string): JobState {
  if (state.status === 'failed') return state;
  if (state.status !== 'running') return state;
  if (exitCode === 0 && reason === undefined) {
    let next = state;
    for (const s of next.stages) {
      if (s.key === 'build') continue;
      if (s.status === 'running' || s.status === 'pending') next = withStage(next, s.key, { status: 'skipped' });
    }
    return withStage(next, 'build', { status: 'running' });
  }
  return fail(state, null, reason ?? `the pipeline exited with code ${exitCode ?? 'unknown'}`);
}

/** The preview build ended. A build failure keeps the pipeline result; only the preview is missing. */
export function buildFinished(state: JobState, error: string | null): JobState {
  if (state.status !== 'running') return state;
  if (error === null) return { ...withStage(state, 'build', { status: 'ok' }), status: 'succeeded' };
  return { ...withStage(state, 'build', { status: 'failed', detail: error }), status: 'succeeded' };
}

/** A queued or running job that will not finish normally (server stopping, timeout before start). */
export function abort(state: JobState, message: string): JobState {
  if (state.status === 'succeeded' || state.status === 'failed') return state;
  if (state.status === 'queued') state = start(state);
  return fail(state, null, message);
}
