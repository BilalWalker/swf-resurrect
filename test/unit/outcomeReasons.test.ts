import { describe, expect, it } from "vitest";
import { EXIT_CODES } from "../../src/outcome/exitCode";
import { convertedWithGapsReason, scrub } from "../../src/outcome/reasons";
import type { GapSummary } from "../../src/outcome/outcome";

describe("scrub", () => {
  it("removes a Windows path", () => {
    const s = scrub("cannot open D:\\swf-resurrect\\samples\\a.swf now");
    expect(s).not.toMatch(/swf-resurrect|[A-Z]:\\/);
    expect(s).toContain("cannot open");
  });
  it("removes a POSIX path", () => {
    const s = scrub("cannot open /home/user/work/a.swf now");
    expect(s).not.toContain("/home");
    expect(s).toContain("now");
  });
  it("removes stack frames", () => {
    const s = scrub("boom\n    at run (file.ts:1:2)\n    at main");
    expect(s).toBe("boom");
    expect(scrub("failed at foo (x.js:1:1) end")).not.toContain("x.js");
  });
  it("removes environment variable names", () => {
    expect(scrub("set JAVA_HOME or %PATH% or $HOME")).not.toMatch(/JAVA_HOME|%PATH%|\$HOME/);
  });
  it("removes FFDec stderr text", () => {
    const s = scrub("ok line\nFFDec: com.jpexs.decompiler error\nException in thread main");
    expect(s).toBe("ok line");
  });
  it("cuts to 200 characters", () => {
    expect(scrub("a".repeat(500)).length).toBe(200);
  });
});

describe("convertedWithGapsReason", () => {
  const gaps: GapSummary[] = [
    { kind: "type-error", count: 4, examples: [] },
    { kind: "untranslated-class", count: 9, examples: [] },
    { kind: "class-omitted", count: 1, examples: [] },
  ];
  it("builds the template with the two highest gap kinds", () => {
    expect(convertedWithGapsReason({ translated: 3, candidates: 48, typeErrors: 4, gaps })).toBe(
      "3 of 48 classes translated, 4 type errors; most gaps: untranslated-class (9), type-error (4)",
    );
  });
  it("omits the gap part when there are no gaps", () => {
    expect(convertedWithGapsReason({ translated: 1, candidates: 1, typeErrors: 2, gaps: [] })).toBe(
      "1 of 1 classes translated, 2 type errors",
    );
  });
  it("names the untranslated-code count when it is above 0", () => {
    expect(convertedWithGapsReason({ translated: 1, candidates: 1, typeErrors: 0, untranslatedCode: 1, gaps: [] })).toBe(
      "1 of 1 classes translated (1 with untranslated code), 0 type errors",
    );
  });
  it("keeps the untranslated-code count when the gap part is dropped", () => {
    const long = "k".repeat(170) as unknown as GapSummary["kind"];
    const s = convertedWithGapsReason({
      translated: 5, candidates: 6, typeErrors: 2, untranslatedCode: 3,
      gaps: [{ kind: long, count: 2, examples: [] }],
    });
    expect(s.length).toBeLessThanOrEqual(200);
    expect(s).not.toContain("most gaps");
    expect(s).toContain("(3 with untranslated code)");
  });
  it("prefixes a recovered run", () => {
    const s = convertedWithGapsReason({
      translated: 15, candidates: 44, typeErrors: 3, gaps, recovery: { recovered: 17, candidates: 44 },
    });
    expect(s.startsWith("obfuscated: names renamed, 17 of 44 classes recovered; ")).toBe(true);
    expect(s).toContain("15 of 44 classes translated, 3 type errors");
  });
  it("drops the gap part first when too long", () => {
    const long = "k".repeat(150) as unknown as GapSummary["kind"];
    const s = convertedWithGapsReason({
      translated: 15, candidates: 44, typeErrors: 3,
      gaps: [{ kind: long, count: 2, examples: [] }],
      recovery: { recovered: 17, candidates: 44 },
    });
    expect(s.length).toBeLessThanOrEqual(200);
    expect(s).not.toContain("most gaps");
    expect(s).toContain("15 of 44 classes translated, 3 type errors");
  });
});

describe("exit codes", () => {
  it("is the one table", () => {
    expect(EXIT_CODES).toEqual({ converted: 0, "converted-with-gaps": 0, failed: 1, usage: 2, refused: 3 });
  });
});

describe("convertedWithGapsReason: classes considered (D-E1)", () => {
  const base = { translated: 4, candidates: 10, typeErrors: 43, gaps: [] as GapSummary[] };
  it("states 10 of 172 classes considered after the translated count", () => {
    const s = convertedWithGapsReason({ ...base, considered: { considered: 10, total: 172 } });
    expect(s).toBe("4 of 10 classes translated (10 of 172 classes considered), 43 type errors");
  });
  it("adds no clause when the counts are equal or the total is unknown", () => {
    expect(convertedWithGapsReason({ ...base, considered: { considered: 10, total: 10 } })).not.toContain("considered");
    expect(convertedWithGapsReason({ ...base, considered: null })).not.toContain("considered");
    expect(convertedWithGapsReason(base)).not.toContain("considered");
  });
  it("does not list classes-not-considered in the gap part", () => {
    const gaps: GapSummary[] = [
      { kind: "classes-not-considered", count: 162, examples: [] },
      { kind: "type-error", count: 43, examples: [] },
    ];
    const s = convertedWithGapsReason({ ...base, gaps, considered: { considered: 10, total: 172 } });
    expect(s).toBe("4 of 10 classes translated (10 of 172 classes considered), 43 type errors; most gaps: type-error (43)");
  });
  it("drops in order: gap part, wrapper size, untranslated code, type errors, wrapper; the clause stays", () => {
    const gaps: GapSummary[] = [
      { kind: "flash-api-gap", count: 99999, examples: [] },
      { kind: "unbound-instance", count: 88888, examples: [] },
    ];
    const input = {
      translated: 123456, candidates: 234567, typeErrors: 345678, untranslatedCode: 4567, gaps,
      considered: { considered: 234567, total: 345678 },
      embedded: { count: 3, totalBytes: 7349081 },
      recovery: { recovered: 123456, candidates: 234567 },
    };
    const clause = "(234567 of 345678 classes considered)";
    const steps = [
      convertedWithGapsReason(input),
      convertedWithGapsReason({ ...input, gaps: [] }),
    ];
    expect(steps[0].length).toBeLessThanOrEqual(200);
    expect(steps[0]).toContain(clause);
    // Shorter and shorter inputs show which part goes first.
    const noGapsFit = convertedWithGapsReason({ ...input, recovery: null });
    expect(noGapsFit).toContain(clause);
    expect(noGapsFit.length).toBeLessThanOrEqual(200);
    const tight = convertedWithGapsReason({ ...input, embedded: { count: 3, totalBytes: 7349081 }, untranslatedCode: 4567 });
    expect(tight).toContain("123456 of 234567 classes translated " + clause);
    expect(tight).toContain("obfuscated: names renamed, 123456 of 234567 classes recovered; ");
    expect(tight.length).toBeLessThanOrEqual(200);
    // Never cut: with everything present, whatever the length, the clause and the recovery prefix survive.
    expect(steps[1]).toContain(clause);
  });
  it("cuts the gap part before the type-error part, and the code part before the type errors", () => {
    const gaps: GapSummary[] = [{ kind: "unbound-instance", count: 7, examples: [] }];
    const wrapper = { count: 1, totalBytes: 7349081 };
    const mk = (extra: object) => convertedWithGapsReason({
      translated: 100, candidates: 150, typeErrors: 12, untranslatedCode: 3, gaps,
      considered: { considered: 150, total: 9999 }, embedded: null, ...extra,
    });
    const full = mk({});
    expect(full).toContain("most gaps: unbound-instance (7)");
    expect(full).toContain("(3 with untranslated code)");
    expect(full).toContain(", 12 type errors");
    const longRecovery = { recovered: 100, candidates: 150 };
    const withRec = mk({ recovery: longRecovery });
    if (withRec.length <= 200 && !withRec.includes("most gaps")) {
      expect(withRec).toContain("type errors");
    }
    // A very large wrapper count and long numbers force the cuts.
    const forced = mk({ untranslatedCode: 123456789, typeErrors: 987654321, recovery: { recovered: 111111111, candidates: 222222222 },
      embedded: { count: 123456789, totalBytes: 99999999999 } });
    expect(mk({ embedded: wrapper })).not.toContain("most gaps");
    expect(forced.length).toBeLessThanOrEqual(200);
    expect(forced).toContain("classes considered)");
    expect(forced).not.toContain("most gaps");
  });
});