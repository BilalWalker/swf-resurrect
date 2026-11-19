import type { Facts, OutcomeLimits, OutcomeRecord, StageRecord } from "../../src/outcome/outcome";

/** The four records whose Outcome_File text is shown in docs/outcome.md (test/unit/outcomeDocs.test.ts). */
const limits: OutcomeLimits = {
  maxSizeMiB: 20,
  runLimitS: 300,
  stageLimitS: 60,
  stageWeights: { recover: 2, unpack: 3, convert: 1, translate: 1, emit: 1, gate: 1, verify: 3 },
};

const facts: Facts = {
  signature: "CWS",
  version: 10,
  compression: "zlib",
  sizeBytes: 48213,
  declaredLength: 90112,
  stage: { width: 550, height: 400 },
  frameRate: 24,
  declaredFrames: 1,
  scriptVersion: "as3",
  abcClassCount: 6,
  source: { header: [], ffdec: [] },
};

function stages(names: StageRecord["name"][], failed?: StageRecord["name"]): StageRecord[] {
  return names.map((name) => ({ name, result: name === failed ? "error" : "ok", durationMs: 120 }));
}

const base = {
  formatVersion: 1 as const,
  limits,
  recovery: null,
};

const scanned = { detected: false, namesScanned: 97, invalidNames: 0, sourceSignals: null };

export const EXAMPLES: Record<"converted" | "converted-with-gaps" | "refused" | "failed", OutcomeRecord> = {
  converted: {
    ...base,
    obfuscated: scanned,
    outcome: "converted",
    reasonCode: null,
    reason: "6 of 6 classes translated",
    facts,
    numbers: {
      candidateClasses: 6,
      translatedClasses: 6,
      cleanClasses: 6,
      looseClasses: 0,
      untranslatedCodeClasses: 0,
      unparsedClasses: 0,
      unsupportedClasses: 0,
      omittedClasses: 0,
      typeErrors: 0,
      droppedPlacements: 0,
      namedLimits: 0,
      stubDependentClasses: 0,
      consideredClasses: 6,
      totalClasses: 6,
      notConsideredClasses: 0,
    },
    gaps: [],
    stages: stages(["unpack", "convert", "translate", "emit", "gate"]),
    referenceId: null,
  },
  "converted-with-gaps": {
    ...base,
    obfuscated: scanned,
    outcome: "converted-with-gaps",
    reasonCode: null,
    reason: "5 of 6 classes translated (6 of 8 classes considered) (1 with untranslated code), 2 type errors; most gaps: type-error (2), untranslated-class (1)",
    facts: { ...facts, abcClassCount: 8 },
    numbers: {
      candidateClasses: 6,
      translatedClasses: 5,
      cleanClasses: 3,
      looseClasses: 1,
      untranslatedCodeClasses: 1,
      unparsedClasses: 0,
      unsupportedClasses: 1,
      omittedClasses: 1,
      typeErrors: 2,
      droppedPlacements: 0,
      namedLimits: 1,
      stubDependentClasses: 1,
      consideredClasses: 6,
      totalClasses: 8,
      notConsideredClasses: 2,
    },
    gaps: [
      { kind: "classes-not-considered", count: 2, examples: [] },
      { kind: "type-error", count: 2, examples: ["Game.as(41): Property 'hitTest' does not exist"] },
      { kind: "untranslated-class", count: 1, examples: ["Spawner"] },
    ],
    stages: stages(["unpack", "convert", "translate", "emit", "gate"]),
    referenceId: null,
  },
  refused: {
    ...base,
    obfuscated: null,
    outcome: "refused",
    reasonCode: "actionscript-1-2",
    reason: "the file uses ActionScript 1 or 2, which is not supported",
    facts: { ...facts, scriptVersion: "as1-2", abcClassCount: null },
    numbers: null,
    gaps: [],
    stages: [],
    referenceId: null,
  },
  failed: {
    ...base,
    obfuscated: scanned,
    outcome: "failed",
    reasonCode: "internal-error",
    reason: "an internal error stopped the run",
    facts,
    numbers: null,
    gaps: [],
    stages: stages(["unpack", "convert", "translate"], "translate"),
    referenceId: "3fa9c01e",
  },
};
