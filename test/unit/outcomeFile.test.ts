// Task 2.1 (robustness Requirements 2.1, 2.7, 2.9, 2.11, 5.8): Outcome_File writer and parser.
import { describe, expect, it } from "vitest";
import type { OutcomeRecord } from "../../src/outcome/outcome";
import { parseOutcome, serialiseOutcome, writeOutcomeFile, type OutcomeFs } from "../../src/outcome/outcomeFile";

function record(over: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    formatVersion: 1,
    outcome: "converted-with-gaps",
    reasonCode: null,
    reason: "3 of 4 classes translated, 1 type errors",
    facts: null,
    numbers: null,
    gaps: [{ kind: "type-error", count: 1, examples: ["Main.ts(3,1): bad"] }],
    limits: { maxSizeMiB: 20, runLimitS: 300, stageLimitS: 60, stageWeights: {} },
    stages: [{ name: "unpack", result: "ok", durationMs: 12 }],
    obfuscated: null,
    recovery: null,
    referenceId: null,
    ...over,
  };
}

function fakeFs(failWrite = false): OutcomeFs & { calls: string[]; files: Map<string, string> } {
  const calls: string[] = [];
  const files = new Map<string, string>();
  return {
    calls,
    files,
    writeFile(p, t) {
      if (failWrite) throw new Error("EACCES");
      calls.push(`write ${p}`);
      files.set(p, t);
    },
    rename(a, b) {
      calls.push(`rename ${a} ${b}`);
      files.set(b, files.get(a) ?? "");
      files.delete(a);
    },
    remove(p) {
      calls.push(`remove ${p}`);
      files.delete(p);
    },
  };
}

describe("Outcome_File", () => {
  it("round trips and accepts numbers: null", () => {
    const r = record();
    expect(parseOutcome(serialiseOutcome(r))).toEqual(r);
    expect(serialiseOutcome(r).endsWith("\n")).toBe(true);
  });

  it("rejects an unknown formatVersion and names it", () => {
    const text = serialiseOutcome(record()).replace('"formatVersion": 1', '"formatVersion": 7');
    expect(() => parseOutcome(text)).toThrow(/7/);
  });

  it("writes the temporary file first, then renames it", async () => {
    const fs = fakeFs();
    const res = await writeOutcomeFile("out", record(), fs, 42);
    expect(res.written).toBe(true);
    expect(fs.calls).toEqual(["write out/outcome.json.tmp-42", "rename out/outcome.json.tmp-42 out/outcome.json"]);
    expect([...fs.files.keys()]).toEqual(["out/outcome.json"]);
  });

  it("returns the flag for an unwritable directory", async () => {
    const res = await writeOutcomeFile("out", record(), fakeFs(true), 1);
    expect(res).toEqual({ written: false, path: null });
  });

  it("writes no absolute path, stack or environment variable", () => {
    const text = serialiseOutcome(
      record({
        reason: "failed at C:\\Users\\me\\x.swf\n    at run (C:\\a\\b.js:1:2) using %APPDATA%",
        gaps: [{ kind: "type-error", count: 1, examples: ["/home/me/proj/a.ts bad $HOME"] }],
      }),
    );
    expect(text).not.toMatch(/C:\\|\/home\/|APPDATA|\$HOME|\bat run\b/);
  });

  it("scrubs facts.source header and ffdec lines", () => {
    const facts = {
      signature: "FWS", version: 10, compression: "none", sizeBytes: 1, declaredLength: 1,
      stage: null, frameRate: null, declaredFrames: null, scriptVersion: "as3", abcClassCount: null,
      source: {
        header: ["bad header in C:\\Users\\me\\a.swf"],
        ffdec: ["SEVERE: java.lang.Error in /home/me/x", "kept line"],
      },
    } as unknown as OutcomeRecord["facts"];
    const text = serialiseOutcome(record({ facts }));
    expect(text).not.toMatch(/C:\\|\/home\/|SEVERE|java\./);
    expect(parseOutcome(text).facts?.source).toEqual({ header: ["bad header in"], ffdec: ["kept line"] });
  });
});

describe("class totals in the Outcome_File (D-E1)", () => {
  const nums = {
    candidateClasses: 10, translatedClasses: 4, cleanClasses: 4, looseClasses: 0, untranslatedCodeClasses: 0, unparsedClasses: 0,
    unsupportedClasses: 0, omittedClasses: 6, typeErrors: 0, droppedPlacements: 0, namedLimits: 0, stubDependentClasses: 0,
    consideredClasses: 10, totalClasses: 172, notConsideredClasses: 162,
  };
  it("round-trips the three fields", () => {
    const rec = record({ numbers: nums });
    expect(parseOutcome(serialiseOutcome(rec)).numbers).toEqual(nums);
  });
  it("reads a file without them as one that holds no total", () => {
    const { consideredClasses: _c, totalClasses: _t, notConsideredClasses: _n, ...old } = nums;
    const parsed = parseOutcome(JSON.stringify({ ...record({ numbers: null }), numbers: old }));
    expect(parsed.numbers).toMatchObject({ consideredClasses: 10, totalClasses: null, notConsideredClasses: null });
  });
});