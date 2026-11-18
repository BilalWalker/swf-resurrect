/**
 * ABC_Name_Scan (robustness design D-B2, Requirements 14.1, 14.4, 14.5). Pure: bytes in, counts out; the verdict is in src/recover/detect.ts, no node:* import.
 * Walks the ABC constant pool of every DoABC (72) and DoABC2 (82) tag without FFDec and counts the multiname names
 * that are not legal identifiers. Never throws.
 */
import type { TagRange } from "./swfBody";

/** A name is legal when it is a letter, `_` or `$` followed by letters, digits, `_` or `$` (Unicode, flag u). */
const IDENTIFIER = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

export interface AbcNameScan {
  /** Multiname entries with a non-empty name that were read. */
  namesScanned: number;
  /** Of those, the names that do not match the identifier rule. */
  invalidNames: number;
  /** True when every ABC tag's multiname table was read to its end and at least one ABC tag exists. */
  complete: boolean;
}

class PastEnd extends Error {}

class Reader {
  pos: number;
  constructor(
    private readonly b: Uint8Array,
    start: number,
    private readonly end: number,
  ) {
    this.pos = start;
  }
  byte(): number {
    if (this.pos >= this.end) throw new PastEnd();
    return this.b[this.pos++];
  }
  /** u30, u32 and s32 share the variable-length encoding of up to five bytes; the value is used unsigned. */
  u30(): number {
    let r = 0;
    let shift = 0;
    for (let i = 0; i < 5; i++) {
      const x = this.byte();
      r += (x & 0x7f) * 2 ** shift;
      shift += 7;
      if ((x & 0x80) === 0) return r;
    }
    return r;
  }
  skip(n: number): void {
    if (n < 0 || this.pos + n > this.end) throw new PastEnd();
    this.pos += n;
  }
  take(n: number): Uint8Array {
    this.skip(n);
    return this.b.subarray(this.pos - n, this.pos);
  }
  /** Entries of a table: the count includes the implicit entry 0, and each entry needs at least `min` bytes. */
  entries(min: number): number {
    const c = this.u30();
    const n = c > 0 ? c - 1 : 0;
    if (n * min > this.end - this.pos) throw new PastEnd();
    return n;
  }
}

/** Reads one constant pool. Pushes the multiname name strings into `names` as they are read. Returns true when finished. */
function walkPool(r: Reader, names: string[]): boolean {
  const decoder = new TextDecoder("utf-8");
  try {
    r.skip(4); // minor_version u16, major_version u16
    for (let n = r.entries(1); n > 0; n--) r.u30(); // ints
    for (let n = r.entries(1); n > 0; n--) r.u30(); // uints
    r.skip(8 * r.entries(8)); // doubles
    const strings: string[] = [""];
    for (let n = r.entries(1); n > 0; n--) strings.push(decoder.decode(r.take(r.u30())));
    for (let n = r.entries(2); n > 0; n--) {
      r.byte();
      r.u30();
    } // namespaces
    for (let n = r.entries(1); n > 0; n--) for (let k = r.u30(); k > 0; k--) r.u30(); // namespace sets
    const nameAt = (i: number): void => {
      const s = strings[i];
      if (s !== undefined && s !== "") names.push(s);
    };
    for (let n = r.entries(1); n > 0; n--) {
      const kind = r.byte();
      switch (kind) {
        case 0x07: // QName
        case 0x0d: // QNameA
          r.u30();
          nameAt(r.u30());
          break;
        case 0x0f: // RTQName
        case 0x10: // RTQNameA
          nameAt(r.u30());
          break;
        case 0x11: // RTQNameL
        case 0x12: // RTQNameLA
          break;
        case 0x09: // Multiname
        case 0x0e: // MultinameA
          nameAt(r.u30());
          r.u30();
          break;
        case 0x1b: // MultinameL
        case 0x1c: // MultinameLA
          r.u30();
          break;
        case 0x1d: // TypeName
          r.u30();
          for (let k = r.u30(); k > 0; k--) r.u30();
          break;
        default:
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** The first ABC byte of a tag: all of tag 72, after flags and the zero-terminated name for tag 82. */
function abcStart(body: Uint8Array, range: TagRange): number | null {
  if (range.start < 0 || range.end > body.length || range.start > range.end) return null;
  if (range.code === 72) return range.start;
  if (range.code !== 82) return null;
  let p = range.start + 4;
  while (p < range.end && body[p] !== 0) p++;
  if (p >= range.end) return null;
  return p + 1;
}

/** `body` and `abcRanges` are what `readFacts` returns. */
export function scanAbcNames(body: Uint8Array, abcRanges: readonly TagRange[]): AbcNameScan {
  const names: string[] = [];
  let complete = abcRanges.length > 0;
  for (const range of abcRanges) {
    const start = abcStart(body, range);
    if (start === null) {
      complete = false;
      continue;
    }
    if (!walkPool(new Reader(body, start, range.end), names)) complete = false;
  }
  const invalidNames = names.filter((s) => !IDENTIFIER.test(s)).length;
  const namesScanned = names.length;
  return { namesScanned, invalidNames, complete };
}
