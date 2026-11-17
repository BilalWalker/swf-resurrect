import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

/** Byte builder for SWF headers, tags and damaged variants. No FFDec involved (robustness Requirement 5.9, 8.1). */

export const TAG = { End: 0, ShowFrame: 1, DoAction: 12, FileAttributes: 69, DoABC: 72, DoABC2: 82, DoInitAction: 59 } as const;

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
