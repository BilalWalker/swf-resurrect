import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXIT_CODES, exitCodeFor } from "../../src/outcome/exitCode";
import { COUNTED_GAP_KINDS, NAMED_LIMIT_KINDS, summariseGaps } from "../../src/outcome/gaps";
import { decideOutcome, type OutcomeCode, type RunRecord } from "../../src/outcome/outcome";
import { fcConfig } from "./config";
import { gapEntriesArb, genRunRecord, runRecordArb } from "./gen/genRunRecord";

const CODES: OutcomeCode[] = ["converted", "converted-with-gaps", "refused", "failed"];
const PROJECT: OutcomeCode[] = ["converted", "converted-with-gaps"];

describe("outcome properties", () => {
  // Feature: robustness, Property 1: One Outcome, decided by the numbers
  // **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.3, 4.9, 4.11, 4.12**
  it("Property 1: one Outcome, decided by the numbers", () => {
    fc.assert(
      fc.property(runRecordArb, (rec: RunRecord) => {
        const o = decideOutcome(rec);
        expect(CODES).toContain(o.outcome);
        const n = rec.numbers;
        const project = rec.failure === null && n !== null && !(n.candidateClasses > 0 && n.translatedClasses === 0);
        const gap = rec.gaps.length > 0 || (n !== null && n.typeErrors > 0);
        if (rec.failure === null) {
          expect(o.outcome === "converted").toBe(project && !gap);
          expect(o.outcome === "converted-with-gaps").toBe(project && gap);
          const nothing = n !== null && n.candidateClasses > 0 && n.translatedClasses === 0;
          expect(o.outcome === "refused" && o.reasonCode === "nothing-translated").toBe(nothing);
          if (n !== null && n.candidateClasses === 0) expect(o.reasonCode).not.toBe("nothing-translated");
        }
        expect(o.reasonCode === null).toBe(PROJECT.includes(o.outcome));
      }),
      fcConfig,
    );
  });

  // Feature: robustness, Property 5: Gap summary matches the entries
  // **Validates: Requirements 2.3, 2.4, 4.2, 4.7**
  it("Property 5: gap summary matches the entries", () => {
    fc.assert(
      fc.property(gapEntriesArb, fc.nat({ max: 50 }), fc.nat({ max: 50 }), (entries, typeErrors, dropped) => {
        const gaps = summariseGaps(entries, { typeErrors, droppedPlacements: dropped });
        const expected = new Map<string, number>();
        for (const e of entries) {
          if ((COUNTED_GAP_KINDS as readonly string[]).includes(e.kind)) expected.set(e.kind, (expected.get(e.kind) ?? 0) + 1);
        }
        if (typeErrors > 0) expected.set("type-error", (expected.get("type-error") ?? 0) + typeErrors);
        if (dropped > 0) expected.set("dropped-placement", (expected.get("dropped-placement") ?? 0) + dropped);
        expect(gaps.map((g) => g.kind).sort()).toEqual([...expected.keys()].sort());
        for (const g of gaps) {
          expect(g.count).toBe(expected.get(g.kind));
          expect(g.examples.length).toBeLessThanOrEqual(5);
          expect(NAMED_LIMIT_KINDS).not.toContain(g.kind);
        }
      }),
      fcConfig,
    );
  });

  // Feature: robustness, Property 5: Gap summary matches the entries (empty if and only if converted)
  // **Validates: Requirements 2.3, 2.4, 4.2, 4.7**
  it("Property 5: the gap array is empty if and only if the Outcome is converted", () => {
    fc.assert(
      fc.property(genRunRecord({ project: true }), (rec) => {
        const o = decideOutcome(rec);
        expect(PROJECT).toContain(o.outcome);
        expect(rec.gaps.length === 0).toBe(o.outcome === "converted");
      }),
      fcConfig,
    );
  });

  // Feature: robustness, Property 6: Reason sentence is bounded and complete
  // **Validates: Requirements 2.2, 4.7, 16.4**
  it("Property 6: the reason sentence is bounded and complete", () => {
    fc.assert(
      fc.property(genRunRecord({ project: true, forceGap: true }), (rec) => {
        const o = decideOutcome(rec);
        expect(o.outcome).toBe("converted-with-gaps");
        expect(o.reason.length).toBeLessThanOrEqual(200);
        const n = rec.numbers!;
        expect(o.reason).toContain(String(n.translatedClasses));
        expect(o.reason).toContain(String(n.candidateClasses));
        expect(o.reason).toContain(String(n.typeErrors));
        const r = rec.recovery;
        if (r && r.attempted && r.skipped === null && !r.fallback) {
          expect(o.reason.startsWith("obfuscated: names renamed")).toBe(true);
        }
      }),
      fcConfig,
    );
  });

  // Feature: robustness, Property 7: Exit code is a function of the outcome
  // **Validates: Requirements 7.1, 7.2, 7.5**
  it("Property 7: the exit code is a function of the outcome", () => {
    fc.assert(
      fc.property(runRecordArb, runRecordArb, (a, b) => {
        const oa = decideOutcome(a);
        const expected = { converted: 0, "converted-with-gaps": 0, failed: 1, refused: 3 }[oa.outcome];
        expect(oa.exitCode).toBe(expected);
        expect(oa.exitCode).toBe(exitCodeFor(oa.outcome));
        expect(Object.values(EXIT_CODES).sort()).toEqual([0, 0, 1, 2, 3]);
        const ob = decideOutcome(b);
        if (oa.outcome === ob.outcome) expect(oa.exitCode).toBe(ob.exitCode);
        expect(decideOutcome(a)).toEqual(oa);
      }),
      fcConfig,
    );
  });
});
