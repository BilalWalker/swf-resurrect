import fc from "fast-check";
import { TAG, tag, type SwfSpec } from "../../support/hostileSwf";

/** A generated SWF header and tag list, plus the script version the rule gives for its tag codes. */
export interface GenHeader {
  spec: Required<Pick<SwfSpec, "signature" | "version" | "width" | "height" | "frameRate" | "frames">> & { tags: number[][] };
  codes: number[];
  expectedScript: "as3" | "as1-2" | "unknown";
}

const CODES = [TAG.ShowFrame, TAG.DoAction, TAG.DoInitAction, TAG.FileAttributes, TAG.DoABC, TAG.DoABC2, 9, 43, 255, 600];

const genTag = fc.record({
  code: fc.constantFrom(...CODES),
  payload: fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 80 }),
  long: fc.boolean(),
});

export const genSwfHeader: fc.Arbitrary<GenHeader> = fc
  .record({
    signature: fc.constantFrom("FWS", "CWS") as fc.Arbitrary<"FWS" | "CWS">,
    version: fc.integer({ min: 1, max: 50 }),
    width: fc.integer({ min: 1, max: 4000 }),
    height: fc.integer({ min: 1, max: 4000 }),
    // Multiples of 1/4 are exact in 8.8 fixed point.
    frameRate: fc.integer({ min: 1, max: 480 }).map((q) => q / 4),
    frames: fc.integer({ min: 0, max: 65535 }),
    raw: fc.array(genTag, { maxLength: 8 }),
  })
  .map(({ raw, ...head }) => {
    const codes = raw.map((t) => t.code);
    const tags = raw.map((t) => tag(t.code, t.payload, t.long));
    const expectedScript = codes.some((c) => c === TAG.DoABC || c === TAG.DoABC2)
      ? "as3"
      : codes.some((c) => c === TAG.DoAction || c === TAG.DoInitAction)
        ? "as1-2"
        : "unknown";
    return { spec: { ...head, tags }, codes, expectedScript } as GenHeader;
  });
