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
