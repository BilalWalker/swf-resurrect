// Spec task 17.7.
import { describe, expect, it } from "vitest";
import {
  STATIC_TEXT_SOURCE,
  candidateUrl,
  classifySampleDir,
  decideFloorTest,
  sha256Hex,
  verifySha256,
} from "../../src/samples/fetchedSample";

const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("fetchedSample", () => {
  it("hashes the empty array to its known SHA-256", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(EMPTY_SHA);
  });

  it("hashes only the bytes of a view onto a larger buffer", async () => {
    const big = new Uint8Array([9, 9, 1, 2, 3, 9]);
    expect(await sha256Hex(big.subarray(2, 5))).toBe(await sha256Hex(new Uint8Array([1, 2, 3])));
  });

  it("reports actual and expected on a mismatch, in lower case", async () => {
    const r = await verifySha256(new Uint8Array([1]), STATIC_TEXT_SOURCE.sha256.toUpperCase());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.expected).toBe(STATIC_TEXT_SOURCE.sha256);
      expect(r.actual).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("builds the pinned raw URL", () => {
    const s = STATIC_TEXT_SOURCE;
    expect(candidateUrl(s.repo, s.commit, s.repoPath)).toBe(
      "https://raw.githubusercontent.com/ruffle-rs/ruffle/4a8d39661ed8aec97afee1504a4e33080da2efd0/tests/tests/swfs/avm2/static_text/test.swf",
    );
  });

  it("decideFloorTest: skip names the fetch command, fail names both values", () => {
    const e = STATIC_TEXT_SOURCE.sha256;
    const skip = decideFloorTest({ present: false, sha256: null }, e);
    expect(skip.action).toBe("skip");
    expect("message" in skip && skip.message).toContain("npm run fetch:static-text");
    const bad = "0".repeat(64);
    const fail = decideFloorTest({ present: true, sha256: bad }, e);
    expect(fail.action).toBe("fail");
    expect("message" in fail && fail.message).toContain(bad);
    expect("message" in fail && fail.message).toContain(e);
    expect(decideFloorTest({ present: true, sha256: e }, e)).toEqual({ action: "run" });
  });

  it("classifySampleDir", () => {
    expect(classifySampleDir(["test.swf", "PROVENANCE.md", "reference"])).toBe("committed");
    expect(classifySampleDir(["PROVENANCE.md", "reference"])).toBe("fetched");
    expect(classifySampleDir(["PROVENANCE.md", "other.swf"])).toBe("invalid");
    expect(classifySampleDir(["reference"])).toBe("invalid");
    expect(classifySampleDir([])).toBe("invalid");
  });
});
