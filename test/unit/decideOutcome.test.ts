import { describe, expect, it } from "vitest";
import { decideOutcome } from "../../src/outcome/outcome";
import type { OutcomeNumbers, RunRecord } from "../../src/outcome/outcome";

const limits = { maxSizeMiB: 20, runLimitS: 300, stageLimitS: 60, stageWeights: {} };

function numbers(over: Partial<OutcomeNumbers> = {}): OutcomeNumbers {
  return {
    candidateClasses: 0,
    translatedClasses: 0,
    cleanClasses: 0,
    looseClasses: 0,
    untranslatedCodeClasses: 0,
    unparsedClasses: 0,
    unsupportedClasses: 0,
    omittedClasses: 0,
    typeErrors: 0,
    droppedPlacements: 0,
    namedLimits: 0,
    ...over,
  };
}

/** A Translation_Report fake: M candidates, N translated (clean). */
function fromReport(m: number, n: number, over: Partial<RunRecord> = {}): RunRecord {
  return {
    facts: null,
    stages: [],
    failure: null,
    numbers: numbers({ candidateClasses: m, translatedClasses: n, cleanClasses: n, omittedClasses: m - n }),
    gaps: m > n ? [{ kind: "untranslated-class", count: m - n, examples: [] }] : [],
    limits,
    recovery: null,
    ...over,
  };
}

describe("decideOutcome", () => {
  it("converted: all candidates translated, no gap", () => {
    const o = decideOutcome(fromReport(5, 5));
    expect(o).toMatchObject({ outcome: "converted", reasonCode: null, exitCode: 0 });
  });

  it("converted-with-gaps: a type error alone is a gap", () => {
    const rec = fromReport(5, 5);
    rec.numbers = numbers({ candidateClasses: 5, translatedClasses: 5, typeErrors: 2 });
    const o = decideOutcome(rec);
    expect(o).toMatchObject({ outcome: "converted-with-gaps", reasonCode: null, exitCode: 0 });
  });

  it("refused: a classified refusal decides first, even with translated classes", () => {
    const o = decideOutcome(
      fromReport(5, 5, { failure: { kind: "refused", reasonCode: "actionscript-1-2" } }),
    );
    expect(o).toMatchObject({ outcome: "refused", reasonCode: "actionscript-1-2", exitCode: 3 });
  });

  it("failed: an internal failure exits 1 with internal-error", () => {
    const o = decideOutcome(fromReport(0, 0, { failure: { kind: "internal", reasonCode: "internal-error" } }));
    expect(o).toMatchObject({ outcome: "failed", reasonCode: "internal-error", exitCode: 1 });
  });

  it("M = 0 (timeline-only) is converted, exit 0, never refused", () => {
    const o = decideOutcome(fromReport(0, 0));
    expect(o).toMatchObject({ outcome: "converted", reasonCode: null, exitCode: 0 });
  });

  it("M > 0 with N = 0 is refused nothing-translated, exit 3", () => {
    const o = decideOutcome(fromReport(4, 0));
    expect(o).toMatchObject({ outcome: "refused", reasonCode: "nothing-translated", exitCode: 3 });
  });

  it("3 of 48 translated is converted-with-gaps, exit 0 (no percentage threshold)", () => {
    const o = decideOutcome(fromReport(48, 3));
    expect(o.outcome).toBe("converted-with-gaps");
    expect(o.exitCode).toBe(0);
    expect(o.reason).toContain("3 of 48 classes translated");
    expect(o.reason.length).toBeLessThanOrEqual(200);
  });

  it("a damaged input is never converted", () => {
    const o = decideOutcome(fromReport(5, 5, { failure: { kind: "refused", reasonCode: "damaged" } }));
    expect(o.outcome).toBe("refused");
    expect(o.reasonCode).toBe("damaged");
    expect(o.outcome).not.toMatch(/^converted/);
  });

  it("no failure and no numbers is never reported as success", () => {
    const o = decideOutcome({ ...fromReport(0, 0), numbers: null });
    expect(o).toMatchObject({ outcome: "failed", reasonCode: "internal-error", exitCode: 1 });
  });

  it("reasonCode is null exactly for the two project outcomes", () => {
    const records = [
      fromReport(1, 1),
      fromReport(2, 1),
      fromReport(2, 0),
      fromReport(1, 1, { failure: { kind: "internal", reasonCode: "internal-error" } }),
    ];
    for (const r of records) {
      const o = decideOutcome(r);
      const project = o.outcome === "converted" || o.outcome === "converted-with-gaps";
      expect(o.reasonCode === null).toBe(project);
    }
  });
});
