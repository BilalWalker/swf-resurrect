/**
 * Signal handling of a run (robustness D-A7, Requirements 6.6, 7.4). `installSignalHandlers` listens for SIGINT and,
 * on Windows, SIGBREAK; the handler calls `guard.abort('signal')`, which kills the registered children and makes the
 * running stage reject, so `runPipeline` writes a `failed` Outcome_File (reason `run stopped by signal`) and returns 1.
 *
 * Windows: SIGTERM cannot be caught (Node documents it as unsupported there), so a kill by a web server is not
 * catchable (Open_Item O5). There is no supervisor process (U9). A synchronous stage blocks the event loop and the
 * handler runs only after it returns (Open_Item O1).
 */
import type { RunGuard } from './guard';

/** The part of `process` this module uses. */
export interface SignalTarget {
  readonly platform: string;
  on(signal: NodeJS.Signals, listener: () => void): unknown;
  off(signal: NodeJS.Signals, listener: () => void): unknown;
}

export interface SignalHandlers {
  /** Pass to `PipelineArgs.onGuard`. A signal received before the guard exists aborts it on arrival. */
  onGuard(guard: RunGuard): void;
  /** Removes every listener this call installed. Idempotent. */
  dispose(): void;
}

/** Signals handled on this platform: SIGINT everywhere, SIGBREAK where it can be delivered (Windows). */
export function handledSignals(platform: string): NodeJS.Signals[] {
  return platform === 'win32' ? ['SIGINT', 'SIGBREAK'] : ['SIGINT'];
}

export function installSignalHandlers(target: SignalTarget): SignalHandlers {
  let guard: RunGuard | null = null;
  let pending = false;
  const listener = (): void => {
    if (guard === null) pending = true;
    else void guard.abort('signal');
  };
  const signals = handledSignals(target.platform);
  for (const s of signals) target.on(s, listener);
  let disposed = false;
  return {
    onGuard(g) {
      guard = g;
      if (pending) void g.abort('signal');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const s of signals) target.off(s, listener);
    },
  };
}
