// RunGuard: the run clock, stage allowances and the run limit (robustness design "Limits and process tree",
// D-A4, D-A5). Pure: the clock and the process-tree kill are passed in, so no node:* import and no global timer here.
import type { OutcomeLimits, StageName, StageRecord } from '../outcome/outcome';
import { stageAllowanceS } from './limits';

export interface Clock {
  /** Milliseconds from any fixed origin; only differences are used. */
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Thrown by `runStage` when the stage allowance or the run limit is reached. `classifyError` keys on `code`. */
export class TimeLimitError extends Error {
  readonly code = 'TIME_LIMIT';
  constructor(
    readonly stage: StageName,
    /** The limit that applied, for example `120 s stage limit` or `300 s run limit`. */
    readonly limit: string,
  ) {
    super(`time limit reached in the ${stage} stage (${limit})`);
    this.name = 'TimeLimitError';
  }
}

/** Thrown by `runStage` after `abort`. `classifyError` keys on `code` (failed, reason `run stopped by signal`). */
export class RunAbortedError extends Error {
  readonly code = 'RUN_ABORTED';
  constructor(readonly cause: string) {
    super(`run aborted (${cause})`);
    this.name = 'RunAbortedError';
  }
}

export interface RunGuard {
  readonly limits: OutcomeLimits;
  /** Stage records so far, in run order. */
  readonly records: StageRecord[];
  runStage<T>(name: StageName, fn: () => Promise<T>): Promise<T>;
  killAll(): Promise<void>;
  /** Milliseconds left of the run limit at this moment (may be negative). Pure over the clock. */
  remainingRunMs(): number;
  /**
   * Ends the run: the running `runStage` rejects with RunAbortedError, every later `runStage` rejects at once,
   * and the registered children are killed. Safe to call more than once.
   */
  abort(cause: string): Promise<void>;
}

export interface GuardOptions {
  clock: Clock;
  limits: OutcomeLimits;
  /** Kills every registered child process tree (`processTree.killAll`). Never throws. */
  killAll: () => Promise<void>;
}

/** The run starts when the guard is created. */
export function createGuard(options: GuardOptions): RunGuard {
  const { clock, limits } = options;
  const runStart = clock.now();
  const records: StageRecord[] = [];
  const runMs = limits.runLimitS * 1000;

  const killAll = async (): Promise<void> => {
    try {
      await options.killAll();
    } catch {
      /* killAll never throws; stay safe */
    }
  };

  let aborted: RunAbortedError | null = null;
  let rejectAbort: (e: RunAbortedError) => void = () => undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  abortPromise.catch(() => undefined);

  async function abort(cause: string): Promise<void> {
    if (aborted === null) {
      aborted = new RunAbortedError(cause);
      rejectAbort(aborted);
    }
    await killAll();
  }

  async function runStage<T>(name: StageName, fn: () => Promise<T>): Promise<T> {
    const start = clock.now();
    if (aborted !== null) {
      records.push({ name, result: 'error', durationMs: 0 });
      throw aborted;
    }
    const runLimit = `${limits.runLimitS} s run limit`;
    const remainingMs = runMs - (start - runStart);
    if (remainingMs <= 0) {
      records.push({ name, result: 'error', durationMs: 0 });
      throw new TimeLimitError(name, runLimit);
    }
    const allowanceS = stageAllowanceS(limits, name);
    const allowanceMs = allowanceS * 1000;
    const runApplies = remainingMs < allowanceMs;
    const budgetMs = runApplies ? remainingMs : allowanceMs;
    const limitText = runApplies ? runLimit : `${allowanceS} s stage limit`;

    let handle: unknown;
    const timer = new Promise<never>((_, reject) => {
      handle = clock.setTimeout(() => reject(new TimeLimitError(name, limitText)), budgetMs);
    });
    const stagePromise = Promise.resolve().then(fn);
    // An abandoned stage may reject later; that must not become an unhandled rejection.
    stagePromise.catch(() => undefined);
    try {
      const value = await Promise.race([stagePromise, timer, abortPromise]);
      records.push({ name, result: 'ok', durationMs: Math.max(0, Math.round(clock.now() - start)) });
      return value;
    } catch (err) {
      if (err instanceof TimeLimitError) await killAll();
      records.push({ name, result: 'error', durationMs: Math.max(0, Math.round(clock.now() - start)) });
      throw err;
    } finally {
      clock.clearTimeout(handle);
    }
  }

  const remainingRunMs = (): number => runMs - (clock.now() - runStart);

  return { limits, records, runStage, killAll, remainingRunMs, abort };
}
