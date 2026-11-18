// Feature: robustness, Property 28: embedded SWF detection finds exactly the DefineBinaryData tags that start with a SWF signature
// **Validates: Requirements 26.6, 26.7**
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readFacts } from "../../src/facts/readFacts";
import { buildSwf, cut, nodeInflate } from "../support/hostileSwf";
import { forbiddenStages, runWithFakes } from "../support/propPipeline";
import { fcConfig } from "./config";
import { binaryTagBytes, genBinaryTags } from "./gen/genBinaryTags";

const limits = { maxSizeBytes: 20 * 1024 * 1024 };
const read = (b: Uint8Array) => readFacts(b, limits, nodeInflate);
const outer = fc.constantFrom<"FWS" | "CWS">("FWS", "CWS");

describe("Property 28: embedded SWF detection", () => {
  it("finds exactly the tags with a signature, 8 bytes and a plausible version, in order", () => {
    fc.assert(
      fc.property(genBinaryTags, outer, (list, signature) => {
        const r = read(buildSwf({ signature, tags: binaryTagBytes(list) }));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const want = list.filter((t) => t.expected !== null);
        expect(r.embeddedSwfs.map((e) => [e.characterId, e.signature, e.version, e.sizeBytes])).toEqual(
          want.map((t) => [t.characterId, t.expected!.signature, t.expected!.version, t.payload.length]),
        );
      }),
      fcConfig,
    );
  });

  it("arbitrary bytes never throw", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        expect(() => read(bytes)).not.toThrow();
      }),
      fcConfig,
    );
  });

  it("a cut file is never read as ok", () => {
    fc.assert(
      fc.property(genBinaryTags, outer, fc.nat(), (list, signature, n) => {
        const full = buildSwf({ signature, tags: binaryTagBytes(list) });
        const r = read(cut(full, n % full.length));
        expect(r.ok).toBe(false);
      }),
      fcConfig,
    );
  });

  it("a cut file ends refused through the pipeline, no stage runs", async () => {
    await fc.assert(
      fc.asyncProperty(genBinaryTags, outer, fc.nat(), async (list, signature, n) => {
        const full = buildSwf({ signature, tags: binaryTagBytes(list) });
        const len = n % full.length;
        const calls: string[] = [];
        const r = await runWithFakes(cut(full, len), forbiddenStages((s) => calls.push(s)));
        expect(calls).toEqual([]);
        expect(r.outcome.outcome).toBe("refused");
        expect(r.outcome.reasonCode).toBe(len < 8 ? "not-swf" : "damaged");
      }),
      { ...fcConfig, numRuns: 8 },
    );
  });
});
