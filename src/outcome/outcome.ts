/**
 * Outcome types (robustness spec, design "Outcome record" and "Data Models").
 * Pure: no node:* import, no clock, no randomness.
 */
import { exitCodeFor } from "./exitCode";
import { convertedWithGapsReason, reasonSentence, scrub } from "./reasons";

export type OutcomeCode = "converted" | "converted-with-gaps" | "refused" | "failed";

export type ReasonCode =
  | "not-swf"
  | "damaged"
  | "actionscript-1-2"
  | "encrypted"
  | "too-large"
  | "time-limit"
  | "nothing-translated"
  | "internal-error";

export type GapKind =
  | "untranslated-class"
  | "class-omitted"
  | "untranslated-code"
  | "unbound-instance"
  | "unrecoverable-class"
  | "type-error"
  | "dropped-placement"
  | "flash-api-gap";

/** Stage names, in run order. Weights are in the limits (D-A4). */
export type StageName = "recover" | "unpack" | "convert" | "translate" | "emit" | "gate" | "verify";

export interface Facts {
  signature: "FWS" | "CWS" | "ZWS";
  version: number;
  compression: "none" | "zlib" | "lzma";
  sizeBytes: number;
  declaredLength: number;
  /** null for ZWS. */
  stage: { width: number; height: number } | null;
  frameRate: number | null;
  declaredFrames: number | null;
  scriptVersion: "as3" | "as1-2" | "unknown";
  /** Filled after Unpack. */
  abcClassCount: number | null;
  source: { header: string[]; ffdec: string[] };
}

export interface RecoveryRecord {
  attempted: boolean;
  skipped: "copy-failed" | "not-obfuscated" | null;
  failedStep: "copy" | "rename" | "deobfuscate" | null;
  /** The original was translated after a failed recovery. */
  fallback: boolean;
  renamedIdentifiers: number;
  deobfuscated: boolean;
  candidateClasses: number;
  /** Translated from the recovered copy (the Recovered_Count). */
  recoveredClasses: number;
  /** After Unpack, from the source signals. */
  unrecoverableClasses: number;
}

/**
 * Amended at Task 12.3. Registered classes are clean, loose or kept with untranslated code; the rest are omitted:
 * cleanClasses + looseClasses + untranslatedCodeClasses + (candidates that are omitted) = candidateClasses, and
 * translatedClasses = cleanClasses + looseClasses + untranslatedCodeClasses.
 */
export interface OutcomeNumbers {
  candidateClasses: number;
  /** Registered by Emit (so emitted and parsed): clean, loose or kept with untranslated code. Never an omitted class. */
  translatedClasses: number;
  cleanClasses: number;
  looseClasses: number;
  /** Registered classes whose status is unsupported and that are not loose: kept, with untranslated code in them. */
  untranslatedCodeClasses: number;
  /** Every candidate whose report status is unsupported, registered or omitted. Overlaps the other fields; not part of the sum above. */
  unsupportedClasses: number;
  /** Every omission of the report, including a linked class that has no candidate (missing-source), so it can exceed candidateClasses. */
  omittedClasses: number;
  typeErrors: number;
  droppedPlacements: number;
  namedLimits: number;
}

export interface GapSummary {
  kind: GapKind;
  count: number;
  /** At most 5. */
  examples: string[];
}

export interface OutcomeLimits {
  maxSizeMiB: number;
  runLimitS: number;
  stageLimitS: number;
  stageWeights: Record<string, number>;
}

export interface StageRecord {
  name: StageName;
  result: "ok" | "error" | "skipped";
  /** The only time-dependent field (D-A10). */
  durationMs: number;
}

export interface OutcomeRecord {
  formatVersion: 1;
  outcome: OutcomeCode;
  /** null if and only if the outcome is one of the two project outcomes. */
  reasonCode: ReasonCode | null;
  /** At most 200 characters, scrubbed. */
  reason: string;
  /** null only if the Facts_Reader did not run. */
  facts: Facts | null;
  /** null for a refusal before Translate ran. */
  numbers: OutcomeNumbers | null;
  gaps: GapSummary[];
  limits: OutcomeLimits;
  stages: StageRecord[];
  obfuscated: {
    detected: boolean;
    namesScanned: number;
    invalidNames: number;
    sourceSignals: number | null;
  } | null;
  recovery: RecoveryRecord | null;
  /** 8 hex digits, only for failed. */
  referenceId: string | null;
}

/** A classified error, from classifyError (task 7). `internal` is a failed run, `refused` a refusal. */
export interface ClassifiedFailure {
  kind: "refused" | "internal";
  reasonCode: ReasonCode;
  /** Scrubbed sentence; when absent the template of the reason code is used. */
  reason?: string;
  stage?: string;
  limit?: string;
}

/** What the pipeline collected; the only input of `decideOutcome` (D-A1). */
export interface RunRecord {
  facts: Facts | null;
  stages: StageRecord[];
  failure: ClassifiedFailure | null;
  /** From the Translation_Report after the gate; null before Translate ran. */
  numbers: OutcomeNumbers | null;
  gaps: GapSummary[];
  limits: OutcomeLimits;
  recovery: RecoveryRecord | null;
}

export interface Outcome {
  outcome: OutcomeCode;
  reasonCode: ReasonCode | null;
  reason: string;
  exitCode: number;
}

/**
 * Pure and total. A classified failure decides first; else refused `nothing-translated` iff
 * candidates > 0 and translated = 0; else converted-with-gaps if any gap or type error; else converted.
 * No percentage threshold (Requirements 4.11, 7.6).
 */
export function decideOutcome(record: RunRecord): Outcome {
  const failure = record.failure;
  if (failure) {
    const code: ReasonCode = failure.kind === "internal" ? "internal-error" : failure.reasonCode;
    const outcome: OutcomeCode = failure.kind === "internal" ? "failed" : "refused";
    const reason = scrub(failure.reason ?? reasonSentence(code, { stage: failure.stage, limit: failure.limit }));
    return { outcome, reasonCode: code, reason, exitCode: exitCodeFor(outcome) };
  }
  const n = record.numbers;
  if (n === null) {
    // A run that ended without a failure must have numbers; never report success without them.
    return {
      outcome: "failed",
      reasonCode: "internal-error",
      reason: reasonSentence("internal-error"),
      exitCode: exitCodeFor("failed"),
    };
  }
  if (n.candidateClasses > 0 && n.translatedClasses === 0) {
    return {
      outcome: "refused",
      reasonCode: "nothing-translated",
      reason: reasonSentence("nothing-translated"),
      exitCode: exitCodeFor("refused"),
    };
  }
  const hasGap =
    n.typeErrors > 0 || n.droppedPlacements > 0 || record.gaps.some((g) => g.count > 0);
  if (hasGap) {
    const rec = record.recovery;
    const reason = convertedWithGapsReason({
      translated: n.translatedClasses,
      candidates: n.candidateClasses,
      typeErrors: n.typeErrors,
      untranslatedCode: n.untranslatedCodeClasses,
      gaps: record.gaps,
      recovery: rec && rec.attempted && rec.skipped === null && !rec.fallback
        ? { recovered: rec.recoveredClasses, candidates: rec.candidateClasses }
        : null,
    });
    return { outcome: "converted-with-gaps", reasonCode: null, reason, exitCode: exitCodeFor("converted-with-gaps") };
  }
  return {
    outcome: "converted",
    reasonCode: null,
    reason: `${n.translatedClasses} of ${n.candidateClasses} classes translated`,
    exitCode: exitCodeFor("converted"),
  };
}
