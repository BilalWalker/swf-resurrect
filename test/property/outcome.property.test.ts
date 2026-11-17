import { mkdir } from "node:fs/promises";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXIT_CODES, exitCodeFor } from "../../src/outcome/exitCode";
import { COUNTED_GAP_KINDS, NAMED_LIMIT_KINDS, summariseGaps } from "../../src/outcome/gaps";
import { decideOutcome, type OutcomeCode, type RunRecord } from "../../src/outcome/outcome";
import { parseOutcome, serialiseOutcome, scrubRecord, OutcomeFileError, writeOutcomeFile } from "../../src/outcome/outcomeFile";
import { classifyError } from "../../src/outcome/classifyError";
import type { PipelineStages } from "../../src/pipeline/pipeline";
import { FfdecExitError } from "../../src/unpack/errors";
import { buildSwf } from "../support/hostileSwf";
import { runWithFakes } from "../support/propPipeline";
import { fcConfig } from "./config";
import { gapEntriesArb, genRunRecord, outcomeRecordArb, runRecordArb, toOutcomeRecord } from "./gen/genRunRecord";

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

  // Feature: robustness, Property 4: Outcome_File round trip and canonical bytes
  // **Validates: Requirements 2.1, 2.2, 2.7, 2.9, 2.10**
  it("Property 4: the Outcome_File round-trips and has canonical bytes", () => {
    fc.assert(
      fc.property(outcomeRecordArb, (rec) => {
        const text = serialiseOutcome(rec);
        expect(parseOutcome(text)).toEqual(JSON.parse(JSON.stringify(scrubRecord(rec))));
        expect(serialiseOutcome(parseOutcome(text))).toBe(text);
        expect(serialiseOutcome(structuredClone(rec))).toBe(text);
        expect(text.endsWith("}\n")).toBe(true);
        expect(text.endsWith("\n\n")).toBe(false);
      }),
      fcConfig,
    );
  });

  it("Property 4: a formatVersion other than 1 is rejected with the version named", () => {
    fc.assert(
      fc.property(outcomeRecordArb, fc.integer({ min: 2, max: 999 }), (rec, v) => {
        const text = serialiseOutcome({ ...rec, formatVersion: v as unknown as 1 });
        expect(() => parseOutcome(text)).toThrow(OutcomeFileError);
        expect(() => parseOutcome(text)).toThrow(String(v));
      }),
      fcConfig,
    );
  });

  it("Property 4: path-like and stack-like text does not reach the written file", () => {
    const dirty = fc.constantFrom(
      "C:\\Users\\me\\x.as failed",
      "failed in /home/me/x.as",
      "boom at Foo.bar (file.js:1:2)",
      "\\\\server\\share\\a.as broke",
    );
    fc.assert(
      fc.property(outcomeRecordArb, dirty, (rec, d) => {
        const dirtyRec = {
          ...rec,
          reason: d,
          gaps: rec.gaps.map((g) => ({ ...g, examples: [d, ...g.examples] })),
        };
        const text = serialiseOutcome(dirtyRec);
        const parsed = parseOutcome(text);
        const texts = [parsed.reason, ...parsed.gaps.flatMap((g) => g.examples)];
        for (const t of texts) {
          expect(t).not.toMatch(/[A-Za-z]:[\\/]/);
          expect(t).not.toMatch(/\\\\[^\s"'<>|*?)]/); // `|` cannot start a UNC name
          expect(t).not.toMatch(/\/home\//);
          expect(t).not.toMatch(/\bat\s+\S+\s*\(/);
        }
      }),
      fcConfig,
    );
  });

  // Feature: robustness, Property 3: Error classification keeps FFDec and our own errors apart
  // **Validates: Requirements 4.5, 5.1, 5.2, 5.3, 5.4**
  const secretArb = fc.stringMatching(/^[a-z]{4,12}$/).map((s) => `ZQX${s}QXZ`);
  const internalErrArb: fc.Arbitrary<unknown> = fc.oneof(
    fc.string().map((m) => new Error(m)),
    fc.string().map((m) => new TypeError(m)),
    fc.string(),
    fc.integer(),
    fc.constant(undefined),
    fc.constant(null),
    fc.record({ message: fc.string() }),
    fc.constantFrom("MISSING_EXPORT", "XML_VERSION", "MISSING_HEADER_VALUE", "X").map((code) => Object.assign(new Error("e"), { code })),
  );

  it("Property 3: classifyError gives damaged only for an FFDec exit at Unpack", () => {
    fc.assert(
      fc.property(secretArb, fc.integer({ min: 1, max: 255 }), internalErrArb, fc.constantFrom("convert", "translate", "emit", "pipeline", "verify"), (secret, code, other, later) => {
        const exit = classifyError(new FfdecExitError(code, secret), "unpack");
        expect(exit).toMatchObject({ kind: "refused", reasonCode: "damaged" });
        expect(JSON.stringify(exit)).not.toContain(secret);
        expect(classifyError(new FfdecExitError(code, secret), later)).toMatchObject({ kind: "internal", reasonCode: "internal-error" });
        const o = classifyError(other, "unpack");
        expect(o).toMatchObject({ kind: "internal", reasonCode: "internal-error" });
        expect(o.reasonCode).not.toBe("damaged");
      }),
      fcConfig,
    );
  });

  it("Property 3: a run whose Unpack throws ends refused damaged or failed internal-error, with no stderr text", async () => {
    const small = { ...fcConfig, numRuns: 25 };
    const unpackThrows = (e: unknown): PipelineStages =>
      ({ unpack: async () => { throw e; }, convert: async () => { throw new Error("no"); }, translate: async () => { throw new Error("no"); }, emit: async () => { throw new Error("no"); }, typeCheck: async () => { throw new Error("no"); } }) as unknown as PipelineStages;
    await fc.assert(
      fc.asyncProperty(secretArb, fc.integer({ min: 1, max: 255 }), async (secret, code) => {
        const r = await runWithFakes(buildSwf(), unpackThrows(new FfdecExitError(code, secret)));
        expect(r.outcome).toMatchObject({ outcome: "refused", reasonCode: "damaged" });
        expect(r.exit).toBe(3);
        expect(r.outcomeText).not.toContain(secret);
        expect(r.outcome.reason).not.toContain(secret);
        expect(r.out).not.toContain(secret);
        expect(r.out.trimEnd().split("\n").at(-1)).toMatch(/^Outcome: refused damaged /);
      }),
      small,
    );
    await fc.assert(
      fc.asyncProperty(internalErrArb, async (e) => {
        const r = await runWithFakes(buildSwf(), unpackThrows(e));
        expect(r.outcome).toMatchObject({ outcome: "failed", reasonCode: "internal-error" });
        expect(r.exit).toBe(1);
        expect(r.out.trimEnd().split("\n").at(-1)).toMatch(/^Outcome: failed internal-error /);
      }),
      small,
    );
  });

  // Feature: robustness, Property 2: A fault at any stage still ends in one valid Outcome
  // **Validates: Requirements 1.6, 1.7, 1.8, 2.5, 3.6, 5.5, 5.7**
  it("Property 2: a fault at any stage still ends in one valid Outcome", async () => {
    const STAGES = ["unpack", "convert", "translate", "emit", "typeCheck", "recover"] as const;
    const faultArb: fc.Arbitrary<unknown> = fc.oneof(
      internalErrArb,
      fc.stringMatching(/^[a-z]{4,12}$/).map((s) => new RangeError(`ZQX${s}QXZ`)),
      fc.constant(Object.create(null)),
    );
    const factsArb = fc.record({
      version: fc.integer({ min: 9, max: 40 }),
      width: fc.integer({ min: 50, max: 1500 }),
      height: fc.integer({ min: 50, max: 1500 }),
      frameRate: fc.integer({ min: 1, max: 60 }),
    });
    const fakes = (at: (typeof STAGES)[number], fault: unknown): PipelineStages => {
      const maybe = (name: (typeof STAGES)[number]): void => {
        if (name === at) throw fault;
      };
      const stages = {
        unpack: async () => (maybe("unpack"), {}),
        convert: async () => (maybe("convert"), { scene: { symbols: {} }, unsupported: [], stats: { svgWritten: 0, morphSkipped: 0, placementsDropped: 0 } }),
        translate: async () => (maybe("translate"), { classes: [], skippedScripts: [] }),
        emit: async (_a: unknown, o: { outputDir: string }) => {
          maybe("emit");
          await mkdir(o.outputDir, { recursive: true });
          return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null };
        },
        typeCheck: async () => (maybe("typeCheck"), { errors: [] }),
        // The recover stage arrives in Task 18; until the pipeline calls it this entry is ignored.
        recover: async () => maybe("recover"),
      };
      return stages as unknown as PipelineStages;
    };
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...STAGES), faultArb, factsArb, async (at, fault, spec) => {
        const r = await runWithFakes(buildSwf(spec), fakes(at, fault));
        expect(Object.values(EXIT_CODES)).toContain(r.exit);
        const parsed = parseOutcome(r.outcomeText);
        expect(parsed.facts).not.toBeNull();
        expect(r.exit).toBe(exitCodeFor(parsed.outcome));
        const lines = r.out.trimEnd().split("\n");
        expect(lines.at(-1)).toMatch(/^Outcome: /);
        expect(lines.filter((l) => l.startsWith("Outcome: "))).toHaveLength(1);
        if (at !== "recover") {
          expect(parsed.outcome).toBe("failed");
          expect(parsed.reasonCode).toBe("internal-error");
          const logs = Object.entries(r.logs).filter(([n]) => n.startsWith("failure-"));
          expect(logs).toHaveLength(1);
          expect(logs[0][0]).toBe(`failure-${parsed.referenceId}.log`);
          // Stack text and the thrown message appear only in the Failure_Log.
          for (const text of [r.out, r.err, r.outcomeText]) {
            expect(text).not.toMatch(/\n\s+at \S+/);
            expect(text).not.toContain("ZQX");
          }
        } else {
          expect(parsed.outcome).toBe("converted");
        }
      }),
      { ...fcConfig, numRuns: 30 },
    );
  });
  // Feature: robustness, Property 14: Determinism of the Outcome_File  // **Validates: Requirements 11.7**
  it("Property 14: two decisions and writes give equal bytes once durationMs is dropped", async () => {
    const dropDuration = (text: string): string => {
      const o = JSON.parse(text);
      for (const s of o.stages) delete s.durationMs;
      return JSON.stringify(o);
    };
    const writeOnce = async (rec: RunRecord): Promise<string> => {
      const files = new Map<string, string>();
      const fs = {
        writeFile: (p: string, t: string) => void files.set(p, t),
        rename: (a: string, b: string) => void files.set(b, files.get(a)!),
      };
      const r = await writeOutcomeFile("out", toOutcomeRecord(rec, "abcdef01"), fs, 1);
      expect(r.written).toBe(true);
      return files.get(r.path!)!;
    };
    await fc.assert(
      fc.asyncProperty(runRecordArb, fc.array(fc.integer({ min: 0, max: 600_000 }), { maxLength: 7 }), async (rec, ds) => {
        const rec2: RunRecord = { ...rec, stages: rec.stages.map((s, i) => ({ ...s, durationMs: ds[i] ?? s.durationMs + 1 })) };
        const a = await writeOnce(rec);
        const b = await writeOnce(rec2);
        expect(dropDuration(a)).toBe(dropDuration(b));
        expect(await writeOnce(rec)).toBe(a);
      }),
      fcConfig,
    );
  });
});