// Direct tests of the SWF body parser behind the Facts_Reader (robustness task 3.1, src/facts/swfBody.ts).
import { describe, expect, it } from "vitest";
import { parseBody, scriptVersionOf, TAG_DO_ABC, TAG_DO_ACTION, TAG_END } from "../../src/facts/swfBody";

/** Short tag record header: code in the top 10 bits, length (< 63) in the low 6. */
const tag = (code: number, content: number[]): number[] => {
  const h = (code << 6) | content.length;
  return [h & 0xff, h >> 8, ...content];
};
// RECT with nbits 0 (one byte), frame rate 24.0 (8.8 fixed, low byte first), 3 frames.
const HEAD = [0x00, 0x00, 24, 3, 0];

describe("parseBody", () => {
  it("reads frame rate, frame count, tag codes and DoABC ranges", () => {
    const body = Uint8Array.from([...HEAD, ...tag(TAG_DO_ABC, [0xaa, 0xbb]), ...tag(TAG_END, [])]);
    const info = parseBody(body);
    expect(info).not.toBeNull();
    expect(info!.frameRate).toBe(24);
    expect(info!.declaredFrames).toBe(3);
    expect(info!.stage).toEqual({ width: 0, height: 0 });
    expect(info!.tagCodes).toEqual([TAG_DO_ABC, TAG_END]);
    expect(info!.abcRanges).toEqual([{ code: TAG_DO_ABC, start: HEAD.length + 2, end: HEAD.length + 4 }]);
  });

  it("returns null for an empty body, a missing End tag and a tag longer than the body", () => {
    expect(parseBody(new Uint8Array(0))).toBeNull();
    expect(parseBody(Uint8Array.from([...HEAD, ...tag(TAG_DO_ABC, [1])]))).toBeNull();
    const cut = [...HEAD, ...tag(TAG_DO_ABC, [1, 2, 3])].slice(0, -2);
    expect(parseBody(Uint8Array.from(cut))).toBeNull();
  });
});

describe("scriptVersionOf", () => {
  it("classifies by the script tags present", () => {
    expect(scriptVersionOf([TAG_DO_ACTION, TAG_DO_ABC, TAG_END])).toBe("as3");
    expect(scriptVersionOf([TAG_DO_ACTION, TAG_END])).toBe("as1-2");
    expect(scriptVersionOf([TAG_END])).toBe("unknown");
  });
});
