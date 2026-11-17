/**
 * Error to Outcome (robustness spec, D-A2). Pure: no node:* import, no clock.
 * Keys on the error `code` and the stage that was running, never on message text, so FFDec
 * stderr text cannot reach a reason.
 */
import type { ClassifiedFailure } from "./outcome";

const MISSING_COMPONENT = "a required component is missing";

function codeOf(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/**
 * `stage` is the stage that was running when the error was thrown (`unpack`, `convert`, ...).
 * Every error not named in the table is an internal error, which ends as `failed`, never `damaged`.
 */
export function classifyError(err: unknown, stage: string): ClassifiedFailure {
  switch (codeOf(err)) {
    case "INVALID_SWF":
      return { kind: "refused", reasonCode: "not-swf", stage };
    case "NOT_AS3":
      return { kind: "refused", reasonCode: "actionscript-1-2", stage };
    case "TIME_LIMIT": {
      // Thrown by the run guard (task 10.2): it names the stage that hit the limit and the limit that applied.
      const e = err as { stage?: unknown; limit?: unknown };
      return {
        kind: "refused",
        reasonCode: "time-limit",
        stage: typeof e.stage === "string" ? e.stage : stage,
        ...(typeof e.limit === "string" ? { limit: e.limit } : {}),
      };
    }
    case "FFDEC_TIMEOUT":
      return { kind: "refused", reasonCode: "time-limit", stage };
    case "FFDEC_EXIT":
      // Only an FFDec exit of the Unpack stage means the file could not be read; the text of
      // FFDec goes to ffdec-<Reference_Id>.log (task 8.1), never to the reason.
      if (stage === "unpack") return { kind: "refused", reasonCode: "damaged", stage };
      return { kind: "internal", reasonCode: "internal-error", stage };
    case "JAVA_NOT_FOUND":
    case "FFDEC_NOT_FOUND":
      return { kind: "internal", reasonCode: "internal-error", reason: MISSING_COMPONENT, stage };
    default:
      return { kind: "internal", reasonCode: "internal-error", stage };
  }
}
