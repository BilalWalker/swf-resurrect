import { describe, expect, it } from "vitest";
import { scrub } from "../../src/outcome/reasons";
import { parseOutcome, serialiseOutcome } from "../../src/outcome/outcomeFile";
import { toOutcomeRecord } from "../property/gen/genRunRecord";

describe("scrub is idempotent", () => {
  // Counterexample from Property 4: removing `$A` left `/-`, which the next pass took for a root path.
  it("pins the `$A/-` counterexample", () => {
    const once = scrub("$A/-");
    expect(scrub(once)).toBe(once);
    expect(once).toBe("");
  });

  it("keeps the Outcome_File bytes canonical for that text", () => {
    const rec = toOutcomeRecord({
      facts: null,
      stages: [],
      failure: null,
      numbers: null,
      gaps: [{ kind: "untranslated-class", count: 1, examples: ["$A/-"] }],
      limits: { maxSizeMiB: 20, runLimitS: 300, stageLimitS: 60, stageWeights: { recover: 2, unpack: 2, convert: 1, translate: 1, emit: 1, gate: 1, verify: 3 } },
      recovery: null,
    });
    const text = serialiseOutcome(rec);
    expect(serialiseOutcome(parseOutcome(text))).toBe(text);
  });
});
