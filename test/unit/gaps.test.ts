import { describe, expect, it } from "vitest";
import { COUNTED_GAP_KINDS, NAMED_LIMIT_KINDS, summariseGaps } from "../../src/outcome/gaps";

describe("summariseGaps", () => {
  it("counts each gap kind of D-A3", () => {
    for (const kind of COUNTED_GAP_KINDS) {
      const g = summariseGaps([{ kind, example: "x" }]);
      expect(g).toEqual([{ kind, count: 1, examples: ["x"] }]);
    }
  });
  it("never counts a Named_Limit kind", () => {
    for (const kind of NAMED_LIMIT_KINDS) expect(summariseGaps([{ kind, example: "x" }])).toEqual([]);
  });
  it("adds type errors and dropped placements from numbers", () => {
    const g = summariseGaps([], { typeErrors: 3, typeErrorExamples: ["TS2304"], droppedPlacements: 2 });
    expect(g).toEqual([
      { kind: "type-error", count: 3, examples: ["TS2304"] },
      { kind: "dropped-placement", count: 2, examples: [] },
    ]);
  });
  it("keeps at most 5 examples and the true count", () => {
    const entries = Array.from({ length: 9 }, (_, i) => ({ kind: "untranslated-class", example: `C${i}` }));
    const [g] = summariseGaps(entries);
    expect(g.count).toBe(9);
    expect(g.examples).toEqual(["C0", "C1", "C2", "C3", "C4"]);
  });
  it("is empty when nothing is counted", () => {
    expect(summariseGaps([])).toEqual([]);
  });
});
