import fc from "fast-check";
import { TAG, binaryDataTag, tag } from "../../support/hostileSwf";

/** One generated DefineBinaryData tag and what detection must say about it. */
export interface GenBinaryTag {
  characterId: number;
  payload: number[];
  expected: { signature: "FWS" | "CWS" | "ZWS"; version: number } | null;
}

const header = (sig: string, version: number, rest: number[]): number[] => [...Buffer.from(sig, "latin1"), version, ...rest];
const rest = fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 4, maxLength: 40 });

const signed: fc.Arbitrary<number[]> = fc
  .tuple(fc.constantFrom("FWS", "CWS", "ZWS"), fc.integer({ min: 1, max: 60 }), rest)
  .map(([s, v, r]) => header(s, v, r));
const badVersion = fc
  .tuple(fc.constantFrom("FWS", "CWS", "ZWS"), fc.constantFrom(0, 61, 200, 255), rest)
  .map(([s, v, r]) => header(s, v, r));
const otherSignature = fc
  .tuple(fc.constantFrom("PNG", "GIF", "fws", "FWZ", "\0\0\0"), fc.integer({ min: 1, max: 60 }), rest)
  .map(([s, v, r]) => header(s, v, r));
const short = fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 7 });
const noise = fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 40 });
// A signature with fewer than 8 bytes of data is never counted.
const shortSigned = fc
  .tuple(fc.constantFrom("FWS", "CWS", "ZWS"), fc.integer({ min: 1, max: 60 }), fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 3 }))
  .map(([s, v, r]) => header(s, v, r));

export const genBinaryTag: fc.Arbitrary<GenBinaryTag> = fc
  .tuple(fc.integer({ min: 0, max: 65535 }), fc.oneof(signed, signed, badVersion, otherSignature, short, noise, shortSigned))
  .map(([characterId, payload]) => {
    const sig = String.fromCharCode(payload[0] ?? 0, payload[1] ?? 0, payload[2] ?? 0);
    const ok = payload.length >= 8 && (sig === "FWS" || sig === "CWS" || sig === "ZWS") && payload[3] >= 1 && payload[3] <= 60;
    return { characterId, payload, expected: ok ? { signature: sig as "FWS" | "CWS" | "ZWS", version: payload[3] } : null };
  });

export const genBinaryTags = fc.array(genBinaryTag, { maxLength: 6 });

/** The tag bytes of a generated list: a DoABC tag first so the file reads as AS3, then each binary-data tag. */
export const binaryTagBytes = (list: readonly GenBinaryTag[]): number[][] => [
  tag(TAG.DoABC, [1, 2, 3]),
  ...list.map((t) => binaryDataTag(t.characterId, t.payload)),
];
