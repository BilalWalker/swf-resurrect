// The Caught_Error sink (Requirement 25.5, D28). Its own module so that events.ts can report without importing
// internal.ts, which imports events.ts. internal.ts re-exports both functions.
import type { CaughtError, ErrorSink } from '../runtime/errorReport';

const defaultErrorSink: ErrorSink = (e) => {
  console.error(`[SWF Resurrect] ${e.site}: ${e.message}`);
};
let errorSink: ErrorSink = defaultErrorSink;

/** Replaces the Caught_Error sink (Requirement 25.5); null restores the console.error default. */
export function setCaughtErrorSink(sink: ErrorSink | null): void {
  errorSink = sink ?? defaultErrorSink;
}

/** Reports one Caught_Error to the current sink. Used by the dispatcher and the script queue. */
export function reportCaughtError(e: CaughtError): void {
  errorSink(e);
}

const namedLimits = new Map<string, string>();
/** Records a run-time Named_Limit once per id (first detail kept). The Replay and Play_Tests read them with 	akeNamedLimits. */
export function namedLimit(id: string, detail = ''): void {
  if (!namedLimits.has(id)) namedLimits.set(id, detail);
}
/** Returns the Named_Limits recorded since the last call, and clears them. */
export function takeNamedLimits(): { id: string; detail: string }[] {
  const out = [...namedLimits].map(([id, detail]) => ({ id, detail }));
  namedLimits.clear();
  return out;
}
