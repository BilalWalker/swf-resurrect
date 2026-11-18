import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

/** Byte builder for SWF headers, tags and damaged variants. No FFDec involved (robustness Requirement 5.9, 8.1). */

export const TAG = { End: 0, ShowFrame: 1, DoAction: 12, FileAttributes: 69, DoABC: 72, DoABC2: 82, DoInitAction: 59, DefineBinaryData: 87, DefineSprite: 39 } as const;

/** The inflate function the edge caller gives readFacts. */
export function nodeInflate(data: Uint8Array, maxOutputLength: number): Uint8Array {
  return new Uint8Array(inflateSync(data, { maxOutputLength: Math.max(1, maxOutputLength) }));
}

function u16(v: number): number[] {
  return [v & 255, (v >> 8) & 255];
}
function u32(v: number): number[] {
  return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
}

/** Frame RECT in twips, `nbits` per field (computed when omitted). */
export function rect(xmin: number, xmax: number, ymin: number, ymax: number, nbits?: number): number[] {
  const need = (v: number): number => (v === 0 ? 1 : v > 0 ? Math.ceil(Math.log2(v + 1)) + 1 : Math.ceil(Math.log2(-v)) + 1);
  const n = nbits ?? Math.max(need(xmin), need(xmax), need(ymin), need(ymax));
  const bits: number[] = [];
  const push = (v: number, width: number): void => {
    const u = v < 0 ? v + 2 ** width : v;
    for (let i = width - 1; i >= 0; i--) bits.push(Math.floor(u / 2 ** i) % 2);
  };
  push(n, 5);
  for (const f of [xmin, xmax, ymin, ymax]) push(f, n);
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  return out;
}

/** One tag record. A payload of 63 bytes or more, or `long: true`, uses the long header. */
export function tag(code: number, payload: number[] = [], long = false): number[] {
  if (long || payload.length >= 63) return [...u16((code << 6) | 63), ...u32(payload.length), ...payload];
  return [...u16((code << 6) | payload.length), ...payload];
}

export const endTag = (): number[] => tag(TAG.End);

export interface SwfSpec {
  signature?: "FWS" | "CWS" | "ZWS";
  version?: number;
  /** Stage size in pixels. */
  width?: number;
  height?: number;
  /** Frame rate, 8.8 fixed point is built from this. */
  frameRate?: number;
  frames?: number;
  /** Tag records; `endTag()` is appended unless `noEnd` is set. */
  tags?: number[][];
  noEnd?: boolean;
  /** Overrides the declared length written in the header. */
  declaredLength?: number;
}

/** The decoded body: RECT, frame rate, frame count, tags. */
export function buildBody(spec: SwfSpec = {}): number[] {
  const w = (spec.width ?? 550) * 20;
  const h = (spec.height ?? 400) * 20;
  const rate = spec.frameRate ?? 24;
  const fixed = Math.round(rate * 256);
  const tags = [...(spec.tags ?? []), ...(spec.noEnd ? [] : [endTag()])];
  return [...rect(0, w, 0, h), fixed & 255, (fixed >> 8) & 255, ...u16(spec.frames ?? 1), ...tags.flat()];
}

/** A whole file. `CWS` compresses the body with zlib; `ZWS` writes a fake LZMA envelope (never decoded). */
export function buildSwf(spec: SwfSpec = {}): Uint8Array {
  const sig = spec.signature ?? "FWS";
  const body = buildBody(spec);
  const declared = spec.declaredLength ?? body.length + 8;
  const head = [...Buffer.from(sig, "latin1"), spec.version ?? 10, ...u32(declared)];
  if (sig === "FWS") return Uint8Array.from([...head, ...body]);
  if (sig === "CWS") return Uint8Array.from([...head, ...deflateSync(Uint8Array.from(body))]);
  return Uint8Array.from([...head, ...u32(4), 0x5d, 0, 0, 1, 0, 0, 0, 0, 0]);
}

/** Replaces the body of a built file (after the 8 byte header) with `deflate(body)` for CWS. */
export function compressBody(sig: "FWS" | "CWS", version: number, declaredLength: number, body: number[]): Uint8Array {
  const head = [...Buffer.from(sig, "latin1"), version, ...u32(declaredLength)];
  return Uint8Array.from([...head, ...(sig === "CWS" ? deflateSync(Uint8Array.from(body)) : body)]);
}

export function cut(bytes: Uint8Array, length: number): Uint8Array {
  return bytes.slice(0, Math.max(0, length));
}

export function flipByte(bytes: Uint8Array, index: number, mask = 0xff): Uint8Array {
  const out = bytes.slice();
  out[index] ^= mask;
  return out;
}

/** A prefix of a committed sample, read from the repository (Requirement 5.9). */
export function cutSample(path: string, length: number): Uint8Array {
  return cut(new Uint8Array(readFileSync(path)), length);
}

/** Variable-length u30/u32/s32 encoding (up to five bytes). */
export function varint(v: number): number[] {
  const out: number[] = [];
  let x = v >>> 0;
  do {
    let b = x & 0x7f;
    x = x >>> 7;
    if (x !== 0) b |= 0x80;
    out.push(b);
  } while (x !== 0);
  return out;
}

/** Multiname kinds of the AVM2 constant pool, with the shape of the data after the kind byte. */
export const MN = {
  QName: 0x07,
  QNameA: 0x0d,
  RTQName: 0x0f,
  RTQNameA: 0x10,
  RTQNameL: 0x11,
  RTQNameLA: 0x12,
  Multiname: 0x09,
  MultinameA: 0x0e,
  MultinameL: 0x1b,
  MultinameLA: 0x1c,
  TypeName: 0x1d,
} as const;

export interface PoolSpec {
  ints?: number;
  uints?: number;
  doubles?: number;
  /** Strings that no multiname uses (literals). */
  literals?: string[];
  /** Namespace names (dotted package paths); each gets one namespace entry and a set of one. */
  namespaces?: string[];
  /** Multinames; `name` is placed in the string table (kinds that carry no name ignore it). `kind` may be any byte. */
  multinames?: Array<{ kind: number; name?: string; typeArgs?: number }>;
  /** Appended after the multiname table (for a test that checks the scan stops at the table's end). */
  trailer?: number[];
}

const NAMED_KINDS: number[] = [MN.QName, MN.QNameA, MN.RTQName, MN.RTQNameA, MN.Multiname, MN.MultinameA];

/** The ABC bytes of a constant pool: minor and major version, then cpool_info (D-B2 layout). Entry 0 of each table is implicit. */
export function buildConstantPool(spec: PoolSpec = {}): number[] {
  const table = (count: number, entry: (i: number) => number[]): number[] => {
    if (count === 0) return [0];
    const out = [...varint(count + 1)];
    for (let i = 0; i < count; i++) out.push(...entry(i));
    return out;
  };
  const strings: string[] = [...(spec.literals ?? []), ...(spec.namespaces ?? [])];
  const nameIndex = new Map<number, number>();
  (spec.multinames ?? []).forEach((m, i) => {
    if (NAMED_KINDS.includes(m.kind) && m.name !== undefined) {
      strings.push(m.name);
      nameIndex.set(i, strings.length); // 1-based: index 0 is the implicit empty string
    }
  });
  const nsNames = spec.namespaces ?? [];
  const litCount = (spec.literals ?? []).length;
  const out: number[] = [0, 0, 46, 0];
  out.push(...table(spec.ints ?? 0, (i) => varint(i + 1)));
  out.push(...table(spec.uints ?? 0, (i) => varint(i + 1)));
  out.push(...table(spec.doubles ?? 0, () => [0, 0, 0, 0, 0, 0, 0xf0, 0x3f]));
  out.push(...table(strings.length, (i) => {
    const bytes = [...Buffer.from(strings[i]!, "utf8")];
    return [...varint(bytes.length), ...bytes];
  }));
  out.push(...table(nsNames.length, (i) => [0x16, ...varint(litCount + i + 1)]));
  out.push(...table(nsNames.length, (i) => [...varint(1), ...varint(i + 1)]));
  out.push(...table((spec.multinames ?? []).length, (i) => {
    const m = spec.multinames![i]!;
    const name = nameIndex.get(i) ?? 0;
    switch (m.kind) {
      case MN.QName:
      case MN.QNameA:
        return [m.kind, ...varint(nsNames.length > 0 ? 1 : 0), ...varint(name)];
      case MN.RTQName:
      case MN.RTQNameA:
        return [m.kind, ...varint(name)];
      case MN.RTQNameL:
      case MN.RTQNameLA:
        return [m.kind];
      case MN.Multiname:
      case MN.MultinameA:
        return [m.kind, ...varint(name), ...varint(nsNames.length > 0 ? 1 : 0)];
      case MN.MultinameL:
      case MN.MultinameLA:
        return [m.kind, ...varint(nsNames.length > 0 ? 1 : 0)];
      case MN.TypeName: {
        const n = m.typeArgs ?? 1;
        return [m.kind, ...varint(1), ...varint(n), ...Array.from({ length: n }, () => varint(1)).flat()];
      }
      default:
        return [m.kind, 1, 1];
    }
  }));
  out.push(...(spec.trailer ?? []));
  return out;
}

/** A DefineBinaryData (87) tag: characterId u16, reserved u32, then the data. */
export function binaryDataTag(characterId: number, data: ArrayLike<number>): number[] {
  return tag(TAG.DefineBinaryData, [...u16(characterId), ...u32(0), ...Array.from(data)], true);
}

/** A small embedded SWF for a binary-data payload: FWS and CWS are real files, ZWS is a header with a few bytes. */
export function embeddedSwfBytes(sig: "FWS" | "CWS" | "ZWS", version = 10): Uint8Array {
  return buildSwf({ signature: sig, version });
}

/** A DoABC (72) payload is the ABC bytes; a DoABC2 (82) payload is u32 flags, a zero-terminated name, then the ABC bytes. */
export function abcTag(code: 72 | 82, abc: number[], name = "frame1"): number[] {
  const payload = code === 72 ? abc : [...u32(0), ...Buffer.from(name, "latin1"), 0, ...abc];
  return tag(code, payload, true);
}
