/**
 * SWF body parsing for the Facts_Reader (robustness design, "Facts_Reader"). Pure: bytes in, values out.
 * Offsets in `TagRange` are relative to the start of the decoded body (the byte after the 8 byte file header).
 */

export const TAG_END = 0;
export const TAG_DO_ACTION = 12;
export const TAG_DO_INIT_ACTION = 59;
export const TAG_DO_ABC = 72;
export const TAG_DO_ABC2 = 82;
export const TAG_DEFINE_BINARY_DATA = 87;

export interface TagRange {
  code: number;
  /** First byte of the tag content (after the record header). */
  start: number;
  /** One past the last content byte. */
  end: number;
}

export interface BodyInfo {
  stage: { width: number; height: number };
  frameRate: number;
  declaredFrames: number;
  /** Every tag code seen, in order, including the End tag. */
  tagCodes: number[];
  /** Byte ranges of DoABC (72) and DoABC2 (82) tags. */
  abcRanges: TagRange[];
  /** Byte ranges of top-level DefineBinaryData (87) tags. Tags inside a sprite are not walked. */
  binaryRanges: TagRange[];
}

/** null means the body is damaged. */
export function parseBody(body: Uint8Array): BodyInfo | null {
  if (body.length < 1) return null;
  const nbits = body[0] >> 3;
  const rectBytes = Math.ceil((5 + 4 * nbits) / 8);
  const headEnd = rectBytes + 4;
  if (body.length < headEnd) return null;

  let bitPos = 5;
  const readSigned = (): number => {
    let v = 0;
    for (let i = 0; i < nbits; i++) {
      const byte = body[bitPos >> 3];
      v = v * 2 + ((byte >> (7 - (bitPos & 7))) & 1);
      bitPos++;
    }
    if (nbits > 0 && v >= 2 ** (nbits - 1)) v -= 2 ** nbits;
    return v;
  };
  const xmin = readSigned();
  const xmax = readSigned();
  const ymin = readSigned();
  const ymax = readSigned();

  const frameRate = body[rectBytes + 1] + body[rectBytes] / 256;
  const declaredFrames = body[rectBytes + 2] | (body[rectBytes + 3] << 8);

  const tagCodes: number[] = [];
  const abcRanges: TagRange[] = [];
  const binaryRanges: TagRange[] = [];
  let pos = headEnd;
  let sawEnd = false;
  while (pos + 2 <= body.length) {
    const h = body[pos] | (body[pos + 1] << 8);
    const code = h >> 6;
    let len = h & 63;
    pos += 2;
    if (len === 63) {
      if (pos + 4 > body.length) return null;
      len = (body[pos] | (body[pos + 1] << 8) | (body[pos + 2] << 16) | (body[pos + 3] << 24)) >>> 0;
      pos += 4;
    }
    if (pos + len > body.length) return null;
    tagCodes.push(code);
    if (code === TAG_DO_ABC || code === TAG_DO_ABC2) abcRanges.push({ code, start: pos, end: pos + len });
    if (code === TAG_DEFINE_BINARY_DATA) binaryRanges.push({ code, start: pos, end: pos + len });
    pos += len;
    if (code === TAG_END) {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) return null;

  return {
    stage: { width: (xmax - xmin) / 20, height: (ymax - ymin) / 20 },
    frameRate,
    declaredFrames,
    tagCodes,
    abcRanges,
    binaryRanges,
  };
}

export function scriptVersionOf(tagCodes: readonly number[]): "as3" | "as1-2" | "unknown" {
  if (tagCodes.some((c) => c === TAG_DO_ABC || c === TAG_DO_ABC2)) return "as3";
  if (tagCodes.some((c) => c === TAG_DO_ACTION || c === TAG_DO_INIT_ACTION)) return "as1-2";
  return "unknown";
}
