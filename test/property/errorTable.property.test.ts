import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyError, ERROR_TABLE } from "../../src/outcome/classifyError";
import { exitCodeFor } from "../../src/outcome/exitCode";
import { decideOutcome, type ClassifiedFailure, type RunRecord } from "../../src/outcome/outcome";
import { fcConfig } from "./config";

const STAGES = ["recover", "unpack", "convert", "translate", "emit", "gate", "verify"];
const TABLE_CODES = new Set(ERROR_TABLE.map((r) => r.code));

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function recordFor(failure: ClassifiedFailure): RunRecord {
  return {
    facts: null,
    stages: [],
    failure,
    numbers: null,
    gaps: [],
    limits: {
      maxSizeMiB: 20,
      runLimitS: 300,
      stageLimitS: 60,
      stageWeights: { recover: 2, unpack: 2, convert: 1, translate: 1, emit: 1, gate: 1, verify: 3 },
    },
    recovery: null,
  } as unknown as RunRecord;
}

const stageArb = fc.constantFrom(...STAGES);
// A marker no reason sentence can contain by chance.
const textArb = fc.string({ minLength: 6, maxLength: 40 }).map((s) => `Q#${s}#Z`);
const rowArb = fc.constantFrom(...ERROR_TABLE);

describe("error table properties", () => {
  // Feature: robustness, Property 27: every error class of the table maps to its stated outcome; an unknown error stays failed internal-error
  // **Validates: Requirements 26.4, 26.5**
  it("Property 27: every table row maps to its stated outcome, independent of message text", () => {
    fc.assert(
      fc.property(rowArb, stageArb, textArb, textArb, (row, stage, m1, m2) => {
        const a = classifyError(codedError(row.code, m1), stage);
        const b = classifyError(codedError(row.code, m2), stage);
        expect(a).toEqual(b);

        const refused = row.kind === "refused" && (row.refusedAtStage === undefined || row.refusedAtStage === stage);
        expect(a.kind).toBe(refused ? "refused" : "internal");
        if (refused) expect(a.reasonCode).toBe(row.reasonCode);
        else expect(a.reasonCode).toBe("internal-error");
        if (row.code === "FFDEC_EXIT") expect(a.kind === "refused").toBe(stage === "unpack");

        const o = decideOutcome(recordFor(a));
        expect(o.exitCode).toBe(exitCodeFor(refused ? "refused" : "failed"));
        expect(o.outcome).toBe(refused ? "refused" : "failed");
        if (o.reasonCode === "damaged") {
          expect(o.outcome).toBe("refused");
          expect(o.reason).not.toContain(m1);
          expect(o.reason).not.toContain(m2);
        }
      }),
      fcConfig,
    );
  });

  // Feature: robustness, Property 27: an unknown code, a plain Error and a non-error value stay failed internal-error
  // **Validates: Requirements 26.4, 26.5**
  it("Property 27: unknown errors stay failed internal-error", () => {
    const unknownCode = fc.string({ minLength: 1, maxLength: 20 }).filter((c) => !TABLE_CODES.has(c));
    const nonError = fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined), fc.record({ code: fc.constantFrom(...TABLE_CODES) }));
    fc.assert(
      fc.property(stageArb, textArb, unknownCode, nonError, (stage, msg, code, other) => {
        const errors: unknown[] = [codedError(code, msg), new Error(msg), other];
        for (const e of errors) {
          const c = classifyError(e, stage);
          expect(c.kind).toBe("internal");
          expect(c.reasonCode).toBe("internal-error");
          const o = decideOutcome(recordFor(c));
          expect(o.outcome).toBe("failed");
          expect(o.exitCode).toBe(exitCodeFor("failed"));
        }
      }),
      fcConfig,
    );
  });
});
