import fc from "fast-check";
import { COUNTED_GAP_KINDS, NAMED_LIMIT_KINDS, summariseGaps, type GapEntry } from "../../../src/outcome/gaps";
import { decideOutcome } from "../../../src/outcome/outcome";
import type {
  ClassifiedFailure,
  Facts,
  OutcomeLimits,
  OutcomeNumbers,
  OutcomeRecord,
  ReasonCode,
  RecoveryRecord,
  RunRecord,
  StageName,
  StageRecord,
} from "../../../src/outcome/outcome";

const STAGES: StageName[] = ["recover", "unpack", "convert", "translate", "emit", "gate", "verify"];

export const factsArb: fc.Arbitrary<Facts> = fc.record({
  signature: fc.constantFrom("FWS" as const, "CWS" as const, "ZWS" as const),
  version: fc.integer({ min: 1, max: 50 }),
  compression: fc.constantFrom("none" as const, "zlib" as const, "lzma" as const),
  sizeBytes: fc.integer({ min: 8, max: 5_000_000 }),
  declaredLength: fc.integer({ min: 8, max: 5_000_000 }),
  stage: fc.option(fc.record({ width: fc.integer({ min: 1, max: 4000 }), height: fc.integer({ min: 1, max: 4000 }) }), {
    nil: null,
  }),
  frameRate: fc.option(fc.integer({ min: 1, max: 120 }), { nil: null }),
  declaredFrames: fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null }),
  scriptVersion: fc.constantFrom("as3" as const, "as1-2" as const, "unknown" as const),
  abcClassCount: fc.option(fc.integer({ min: 0, max: 500 }), { nil: null }),
  source: fc.record({ header: fc.array(fc.string(), { maxLength: 3 }), ffdec: fc.array(fc.string(), { maxLength: 3 }) }),
});

export const stagesArb: fc.Arbitrary<StageRecord[]> = fc.array(
  fc.record({
    name: fc.constantFrom(...STAGES),
    result: fc.constantFrom("ok" as const, "error" as const, "skipped" as const),
    durationMs: fc.integer({ min: 0, max: 600_000 }),
  }),
  { maxLength: 7 },
);

const limitsArb: fc.Arbitrary<OutcomeLimits> = fc.constant({
  maxSizeMiB: 20,
  runLimitS: 300,
  stageLimitS: 60,
  stageWeights: { recover: 2, unpack: 2, convert: 1, translate: 1, emit: 1, gate: 1, verify: 3 },
});

const exampleArb = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.string({ minLength: 250, maxLength: 400 }),
  fc.constantFrom("C:\\Users\\me\\x.as failed", "/home/me/x.as failed", "at Foo.bar (file.js:1:2)"),
);

/** Entries of counted kinds, Named_Limit kinds and an unknown kind. */
export const gapEntriesArb: fc.Arbitrary<GapEntry[]> = fc.array(
  fc.record({
    kind: fc.constantFrom(...COUNTED_GAP_KINDS, ...NAMED_LIMIT_KINDS, "something-else"),
    example: fc.option(exampleArb, { nil: undefined }),
  }),
  { maxLength: 40 },
);

const reasonCodeArb: fc.Arbitrary<ReasonCode> = fc.constantFrom(
  "not-swf",
  "damaged",
  "actionscript-1-2",
  "encrypted",
  "too-large",
  "time-limit",
  "nothing-translated",
  "internal-error",
);

export const failureArb: fc.Arbitrary<ClassifiedFailure> = fc.record({
  kind: fc.constantFrom("refused" as const, "internal" as const),
  reasonCode: reasonCodeArb,
  reason: fc.option(fc.string({ maxLength: 300 }), { nil: undefined }),
  stage: fc.option(fc.constantFrom(...STAGES), { nil: undefined }),
  limit: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
});

export const recoveryArb: fc.Arbitrary<RecoveryRecord> = fc.record({
  attempted: fc.boolean(),
  skipped: fc.constantFrom(null, "copy-failed" as const, "not-obfuscated" as const),
  failedStep: fc.constantFrom(null, "copy" as const, "rename" as const, "deobfuscate" as const),
  fallback: fc.boolean(),
  renamedIdentifiers: fc.nat({ max: 100000 }),
  deobfuscated: fc.boolean(),
  candidateClasses: fc.nat({ max: 100000 }),
  recoveredClasses: fc.nat({ max: 100000 }),
  unrecoverableClasses: fc.nat({ max: 100000 }),
});

export interface RunRecordOptions {
  /** Force a project run (no failure, numbers present, M > 0, N > 0). */
  project?: boolean;
  /** Force at least one gap (needs `project`). */
  forceGap?: boolean;
}

/**
 * A consistent run record: the gap list is the summary of generated entries plus the type error and
 * dropped placement counts, which are also the record's numbers.
 */
export function genRunRecord(opts: RunRecordOptions = {}): fc.Arbitrary<RunRecord> {
  const countsArb = fc.record({
    candidates: opts.project ? fc.integer({ min: 1, max: 100000 }) : fc.oneof(fc.constant(0), fc.nat({ max: 100000 })),
    translatedFrac: opts.project ? fc.double({ min: 0.01, max: 1, noNaN: true }) : fc.double({ min: 0, max: 1, noNaN: true }),
    zeroTranslated: opts.project ? fc.constant(false) : fc.boolean(),
    typeErrors: fc.oneof(fc.constant(0), fc.nat({ max: 100000 })),
    dropped: fc.oneof(fc.constant(0), fc.nat({ max: 1000 })),
  });
  return fc
    .record({
      facts: fc.option(factsArb, { nil: null }),
      stages: stagesArb,
      failure: opts.project ? fc.constant(null) : fc.option(failureArb, { nil: null }),
      noNumbers: opts.project ? fc.constant(false) : fc.boolean(),
      counts: countsArb,
      entries: gapEntriesArb,
      limits: limitsArb,
      recovery: fc.option(recoveryArb, { nil: null }),
    })
    .map((r) => {
      const { candidates, translatedFrac, zeroTranslated, dropped } = r.counts;
      let typeErrors = r.counts.typeErrors;
      if (opts.forceGap && typeErrors === 0 && dropped === 0 && !r.entries.some((e) => (COUNTED_GAP_KINDS as readonly string[]).includes(e.kind))) {
        typeErrors = 1;
      }
      const translated = zeroTranslated ? 0 : Math.max(opts.project ? 1 : 0, Math.min(candidates, Math.round(candidates * translatedFrac)));
      const untranslatedCode = translated >= 2 && candidates % 2 === 0 ? 1 : 0;
      const numbers: OutcomeNumbers = {
        candidateClasses: candidates,
        translatedClasses: translated,
        cleanClasses: translated - untranslatedCode,
        looseClasses: 0,
        untranslatedCodeClasses: untranslatedCode,
        unsupportedClasses: untranslatedCode,
        omittedClasses: candidates - translated,
        typeErrors,
        droppedPlacements: dropped,
        namedLimits: 0,
      };
      return {
        facts: r.facts,
        stages: r.stages,
        failure: r.failure,
        numbers: r.noNumbers ? null : numbers,
        gaps: summariseGaps(r.entries, { typeErrors, droppedPlacements: dropped }),
        limits: r.limits,
        recovery: r.recovery,
      } satisfies RunRecord;
    });
}

export const runRecordArb: fc.Arbitrary<RunRecord> = genRunRecord();

/** An Outcome_File record built the way the pipeline does: the decision plus the run record. */
export function toOutcomeRecord(rec: RunRecord, referenceId: string | null = null): OutcomeRecord {
  const o = decideOutcome(rec);
  return {
    formatVersion: 1,
    outcome: o.outcome,
    reasonCode: o.reasonCode,
    reason: o.reason,
    facts: rec.facts,
    numbers: rec.numbers,
    gaps: rec.gaps,
    limits: rec.limits,
    stages: rec.stages,
    obfuscated: null,
    recovery: rec.recovery,
    referenceId: o.outcome === "failed" ? referenceId : null,
  };
}

export const outcomeRecordArb: fc.Arbitrary<OutcomeRecord> = fc
  .tuple(runRecordArb, fc.stringMatching(/^[0-9a-f]{8}$/))
  .map(([r, id]) => toOutcomeRecord(r, id));
