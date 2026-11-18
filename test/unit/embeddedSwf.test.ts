// Embedded SWF detection (robustness task 27.1, design D-D3a).
import { describe, expect, it } from "vitest";
import { detectEmbeddedSwfs } from "../../src/facts/embeddedSwf";
import { readFacts } from "../../src/facts/readFacts";
import { TAG, binaryDataTag, buildSwf, cut, embeddedSwfBytes, nodeInflate, tag } from "../support/hostileSwf";

const limits = { maxSizeBytes: 20 * 1024 * 1024 };
const embedded = (tags: number[][]) => {
  const r = readFacts(buildSwf({ tags: [tag(TAG.DoABC, [1, 2, 3]), ...tags] }), limits, nodeInflate);
  if (!r.ok) throw new Error("expected ok");
  return r.embeddedSwfs;
};

describe("embedded SWF detection", () => {
  for (const sig of ["FWS", "CWS", "ZWS"] as const) {
    it(`finds a ${sig} payload`, () => {
      const inner = embeddedSwfBytes(sig, 10);
      const found = embedded([binaryDataTag(46, inner)]);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        characterId: 46, signature: sig, version: 10, sizeBytes: inner.length,
        declaredLength: inner[4] | (inner[5] << 8) | (inner[6] << 16) | (inner[7] << 24),
      });
    });
  }

  it("reports each of two tags, in order, with the offset of the data", () => {
    const a = embeddedSwfBytes("FWS");
    const b = embeddedSwfBytes("CWS");
    const found = embedded([binaryDataTag(5, a), binaryDataTag(6, b)]);
    expect(found.map((f) => [f.characterId, f.signature])).toEqual([[5, "FWS"], [6, "CWS"]]);
    expect(found[1].offset).toBeGreaterThan(found[0].offset + a.length);
  });

  it("does not count data without a signature, or a payload under 8 bytes", () => {
    expect(embedded([binaryDataTag(1, [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0])])).toEqual([]);
    expect(embedded([binaryDataTag(2, [0x46, 0x57])])).toEqual([]);
    expect(embedded([binaryDataTag(3, [0x46, 0x57, 0x53, 10, 1, 0, 0])])).toEqual([]);
    expect(embedded([binaryDataTag(4, [])])).toEqual([]);
  });

  it("does not count an implausible version byte", () => {
    expect(embedded([binaryDataTag(1, [0x46, 0x57, 0x53, 0, 8, 0, 0, 0])])).toEqual([]);
    expect(embedded([binaryDataTag(1, [0x46, 0x57, 0x53, 200, 8, 0, 0, 0])])).toEqual([]);
  });

  it("scans only top-level tags: a binary-data tag inside a sprite is not found", () => {
    const inner = embeddedSwfBytes("FWS");
    const sprite = tag(TAG.DefineSprite, [1, 0, 1, 0, ...binaryDataTag(9, inner), ...tag(TAG.End)], true);
    expect(embedded([sprite])).toEqual([]);
  });

  it("an outer ZWS file has no readable body and reports none", () => {
    const r = readFacts(buildSwf({ signature: "ZWS" }), limits, nodeInflate);
    expect(r.ok && r.embeddedSwfs).toEqual([]);
  });

  it("never throws on a tag cut short or ranges beyond the body", () => {
    const whole = buildSwf({ tags: [binaryDataTag(46, embeddedSwfBytes("FWS"))] });
    for (let n = 0; n < whole.length; n++) expect(() => readFacts(cut(whole, n), limits, nodeInflate)).not.toThrow();
    expect(detectEmbeddedSwfs(new Uint8Array(4), [{ code: 87, start: 0, end: 100 }])).toEqual([]);
  });
});
