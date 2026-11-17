import { describe, expect, it } from "vitest";
import { MAX_UNCOMPRESSED, readFacts } from "../../src/facts/readFacts";
import {
  TAG, buildBody, buildSwf, compressBody, cut, flipByte, nodeInflate, tag,
} from "../support/hostileSwf";

const limits = { maxSizeBytes: 20 * 1024 * 1024 };
const read = (b: Uint8Array) => readFacts(b, limits, nodeInflate);

describe("readFacts", () => {
  it("step 1: short input and a wrong signature are not-swf", () => {
    expect(read(new Uint8Array([0x46, 0x57, 0x53]))).toEqual({ ok: false, reasonCode: "not-swf", facts: null });
    expect(read(new TextEncoder().encode("<html>not a swf</html>"))).toMatchObject({ ok: false, reasonCode: "not-swf" });
  });

  it("step 2: a file above maxSize is too-large", () => {
    const r = readFacts(buildSwf(), { maxSizeBytes: 10 }, nodeInflate);
    expect(r).toMatchObject({ ok: false, reasonCode: "too-large" });
  });

  it("step 3: FWS body is the rest; header facts are read", () => {
    const r = read(buildSwf({ version: 9, width: 640, height: 480, frameRate: 30, frames: 7, tags: [tag(TAG.DoABC, [1, 2, 3])] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.facts).toMatchObject({
      signature: "FWS", version: 9, compression: "none", stage: { width: 640, height: 480 },
      frameRate: 30, declaredFrames: 7, scriptVersion: "as3", abcClassCount: null,
    });
    expect(r.facts.source.header).toContain("stage");
    expect(r.facts.source.ffdec).toEqual([]);
    expect(r.abcRanges).toHaveLength(1);
    expect(Array.from(r.body.subarray(r.abcRanges[0].start, r.abcRanges[0].end))).toEqual([1, 2, 3]);
  });

  it("step 3: CWS is inflated", () => {
    const r = read(buildSwf({ signature: "CWS", tags: [tag(TAG.DoABC2, [9])] }));
    expect(r).toMatchObject({ ok: true, facts: { signature: "CWS", compression: "zlib", scriptVersion: "as3" } });
  });

  it("step 3: a truncated CWS stream is damaged", () => {
    const full = buildSwf({ signature: "CWS", tags: [tag(TAG.DoABC, new Array(500).fill(7))] });
    const r = read(cut(full, full.length - 6));
    expect(r).toMatchObject({ ok: false, reasonCode: "damaged" });
    expect(r.facts).toMatchObject({ signature: "CWS" });
  });

  it("step 3: a flipped byte in the zlib stream is damaged", () => {
    const r = read(flipByte(buildSwf({ signature: "CWS" }), 8));
    expect(r).toMatchObject({ ok: false, reasonCode: "damaged" });
  });

  it("step 3: ZWS gives header-only facts", () => {
    const r = read(buildSwf({ signature: "ZWS" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.facts).toMatchObject({
      signature: "ZWS", compression: "lzma", stage: null, frameRate: null, declaredFrames: null, scriptVersion: "unknown",
    });
  });

  it("step 3: the 128 MiB cap on the declared length is too-large", () => {
    const over = buildSwf({ signature: "CWS", declaredLength: MAX_UNCOMPRESSED + 1 });
    expect(read(over)).toMatchObject({ ok: false, reasonCode: "too-large" });
    const edge = buildSwf({ signature: "CWS", declaredLength: MAX_UNCOMPRESSED });
    expect(read(edge)).toMatchObject({ ok: false, reasonCode: "damaged" });
  });

  it("step 4: the CWS declared length must match the decoded length", () => {
    const body = buildBody({});
    const r = read(compressBody("CWS", 10, body.length + 8 + 1, body));
    expect(r).toMatchObject({ ok: false, reasonCode: "damaged" });
    expect(read(compressBody("CWS", 10, body.length + 8, body)).ok).toBe(true);
  });

  it("step 5: a tag that runs past the body, or a missing End, is damaged", () => {
    const body = [...buildBody({ noEnd: true }), ...tag(TAG.DoABC, [1, 2, 3, 4]).slice(0, 4)];
    expect(read(compressBody("FWS", 10, body.length + 8, body))).toMatchObject({ ok: false, reasonCode: "damaged" });
    expect(read(buildSwf({ noEnd: true }))).toMatchObject({ ok: false, reasonCode: "damaged" });
  });

  it("step 5: long-form tags and unknown tag codes are walked and ignored", () => {
    const r = read(buildSwf({ tags: [tag(999, [1, 2], true), tag(TAG.ShowFrame), tag(TAG.DoABC, new Array(100).fill(0))] }));
    expect(r).toMatchObject({ ok: true, facts: { scriptVersion: "as3" } });
  });

  it("step 6: DoAction (12) is as1-2 and refused", () => {
    const r = read(buildSwf({ tags: [tag(TAG.DoAction, [0])] }));
    expect(r).toMatchObject({ ok: false, reasonCode: "actionscript-1-2", facts: { scriptVersion: "as1-2" } });
  });

  it("step 6: DoInitAction (59) is as1-2", () => {
    expect(read(buildSwf({ tags: [tag(TAG.DoInitAction, [0, 0])] }))).toMatchObject({ reasonCode: "actionscript-1-2" });
  });

  it("step 6: DoABC and DoABC2 together with DoAction count as as3", () => {
    const r = read(buildSwf({ tags: [tag(TAG.DoAction), tag(TAG.DoABC2, [1])] }));
    expect(r).toMatchObject({ ok: true, facts: { scriptVersion: "as3" } });
  });

  it("FileAttributes (69) without a DoABC tag is unknown and goes on", () => {
    const r = read(buildSwf({ tags: [tag(TAG.FileAttributes, [0x08, 0, 0, 0])] }));
    expect(r).toMatchObject({ ok: true, facts: { scriptVersion: "unknown" } });
  });

  it("never throws on a cut of every length", () => {
    const full = buildSwf({ signature: "CWS", tags: [tag(TAG.DoABC, new Array(80).fill(3))] });
    for (let n = 0; n <= full.length; n++) expect(() => read(cut(full, n))).not.toThrow();
  });
});
