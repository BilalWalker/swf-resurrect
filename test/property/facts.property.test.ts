import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readFacts } from "../../src/facts/readFacts";
import { buildSwf, cut, flipByte, nodeInflate } from "../support/hostileSwf";
import { fcConfig } from "./config";
import { genSwfHeader } from "./gen/genSwfHeader";

const limits = { maxSizeBytes: 20 * 1024 * 1024 };
const read = (b: Uint8Array) => readFacts(b, limits, nodeInflate);

describe("Facts_Reader properties", () => {
  it("Property 8: Facts round trip over generated headers", () => {
    // **Validates: Requirements 3.1, 3.2, 3.3, 3.8**
    fc.assert(
      fc.property(genSwfHeader, (g) => {
        const bytes = buildSwf(g.spec);
        const r = read(bytes);
        const facts = r.facts;
        expect(facts).not.toBeNull();
        if (facts === null) return;
        const body = (bytes.length - 8) as number;
        expect(facts.signature).toBe(g.spec.signature);
        expect(facts.version).toBe(g.spec.version);
        expect(facts.compression).toBe(g.spec.signature === "FWS" ? "none" : "zlib");
        expect(facts.sizeBytes).toBe(bytes.length);
        expect(facts.stage).toEqual({ width: g.spec.width, height: g.spec.height });
        expect(facts.frameRate).toBe(g.spec.frameRate);
        expect(facts.declaredFrames).toBe(g.spec.frames);
        expect(facts.scriptVersion).toBe(g.expectedScript);
        const declared = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
        expect(facts.declaredLength).toBe(declared >>> 0);
        expect(body).toBeGreaterThanOrEqual(0);
        expect(r.ok).toBe(g.expectedScript !== "as1-2");
        if (!r.ok) expect(r.reasonCode).toBe("actionscript-1-2");
      }),
      fcConfig,
    );
  });

  it("Property 9: Arbitrary bytes never throw; non-SWF bytes are not-swf", () => {
    // **Validates: Requirements 3.5, 3.9**
    const sigs = ["FWS", "CWS", "ZWS"];
    const startsWithSig = (b: Uint8Array) => b.length >= 3 && sigs.includes(String.fromCharCode(b[0], b[1], b[2]));
    const damaged = genSwfHeader.chain((g) =>
      fc.tuple(fc.nat(), fc.integer({ min: 1, max: 255 })).map(([i, m]) => {
        const b = buildSwf(g.spec);
        return i % 2 === 0 ? flipByte(b, i % b.length, m) : cut(b, i % (b.length + 1));
      }),
    );
    fc.assert(
      fc.property(fc.oneof(fc.uint8Array({ maxLength: 200 }), damaged), (bytes) => {
        const r = read(bytes);
        expect(typeof r.ok).toBe("boolean");
        if (bytes.length < 8 || !startsWithSig(bytes)) {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.reasonCode).toBe("not-swf");
        }
      }),
      fcConfig,
    );
  });
});
