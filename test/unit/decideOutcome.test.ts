import { describe, expect, it } from "vitest";
import { summariseGaps } from "../../src/outcome/gaps";
import { decideOutcome, notConsideredOf } from "../../src/outcome/outcome";
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
    stubDependentClasses: 0,
    consideredClasses: over.candidateClasses ?? 0,
    totalClasses: null,
    notConsideredClasses: null,
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

describe("decideOutcome: classes considered (D-E1)", () => {
  const clean = (over: Partial<OutcomeNumbers>) => {
    const rec = fromReport(10, 10);
    rec.gaps = [];
    rec.numbers = numbers({ candidateClasses: 10, translatedClasses: 10, cleanClasses: 10, ...over });
    return rec;
  };
  it("classes not considered make a clean run converted-with-gaps and state the numbers", () => {
    const o = decideOutcome(clean({ totalClasses: 172, notConsideredClasses: 162 }));
    expect(o.outcome).toBe("converted-with-gaps");
    expect(o.reason).toBe("10 of 10 classes translated (10 of 172 classes considered), 0 type errors");
  });
  it("a timeline-only file (0 of 0), an equal count and an unknown total stay converted", () => {
    expect(decideOutcome(clean({ candidateClasses: 0, translatedClasses: 0, cleanClasses: 0, totalClasses: 0, notConsideredClasses: 0 })).outcome).toBe("converted");
    expect(decideOutcome(clean({ totalClasses: 10, notConsideredClasses: 0 })).outcome).toBe("converted");
    expect(decideOutcome(clean({ totalClasses: null, notConsideredClasses: null })).outcome).toBe("converted");
  });
  it("notConsideredOf clamps at 0 and is null without a total", () => {
    expect(notConsideredOf(10, 172)).toBe(162);
    expect(notConsideredOf(12, 10)).toBe(0);
    expect(notConsideredOf(10, null)).toBeNull();
  });
  it("summariseGaps records the gap kind with the count", () => {
    expect(summariseGaps([], { notConsideredClasses: 162 })).toEqual([{ kind: "classes-not-considered", count: 162, examples: [] }]);
    expect(summariseGaps([], { notConsideredClasses: 0 })).toEqual([]);
  });
});