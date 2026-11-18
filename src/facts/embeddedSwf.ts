/**
 * Embedded SWF detection (robustness design D-D3a). Pure: bytes in, values out, never throws.
 * A DefineBinaryData tag is: characterId u16, reserved u32, then the data. It counts as an embedded SWF when the
 * data holds at least the 8 byte SWF header, starts with FWS, CWS or ZWS and the version byte is plausible.
 * Only top-level tags are scanned (the Facts walk does not enter sprites).
 */
import type { EmbeddedSwfSummary } from "../outcome/outcome";
import type { TagRange } from "./swfBody";

export interface EmbeddedSwf {
  characterId: number;
  signature: "FWS" | "CWS" | "ZWS";
  version: number;
  /** Length of the data in bytes (the tag content minus the 6 byte prefix). */
  sizeBytes: number;
  /** The length the embedded header declares. */
  declaredLength: number;
  /** First data byte, relative to the start of the decoded body. */
  offset: number;
}

const PREFIX = 6;
const HEADER = 8;
const MIN_VERSION = 1;
const MAX_VERSION = 60;

export function detectEmbeddedSwfs(body: Uint8Array, binaryRanges: readonly TagRange[]): EmbeddedSwf[] {
  const found: EmbeddedSwf[] = [];
  for (const r of binaryRanges) {
    const dataStart = r.start + PREFIX;
    if (r.end > body.length || r.end - dataStart < HEADER) continue;
    const sig = String.fromCharCode(body[dataStart], body[dataStart + 1], body[dataStart + 2]);
    if (sig !== "FWS" && sig !== "CWS" && sig !== "ZWS") continue;
    const version = body[dataStart + 3];
    if (version < MIN_VERSION || version > MAX_VERSION) continue;
    const declaredLength =
      (body[dataStart + 4] | (body[dataStart + 5] << 8) | (body[dataStart + 6] << 16) | (body[dataStart + 7] << 24)) >>> 0;
    found.push({
      characterId: body[r.start] | (body[r.start + 1] << 8),
      signature: sig,
      version,
      sizeBytes: r.end - dataStart,
      declaredLength,
      offset: dataStart,
    });
  }
  return found;
}

/** Count and sizes of the detected embedded SWFs; null when there are none. */
export function summariseEmbeddedSwfs(list: readonly EmbeddedSwf[]): EmbeddedSwfSummary | null {
  if (list.length === 0) return null;
  let totalBytes = 0;
  let largestBytes = 0;
  for (const e of list) {
    totalBytes += e.sizeBytes;
    if (e.sizeBytes > largestBytes) largestBytes = e.sizeBytes;
  }
  return { count: list.length, totalBytes, largestBytes };
}

/** A generic gap example: id, signature, version and size only, never a class name. */
export function embeddedSwfExample(e: EmbeddedSwf): string {
  return `id ${e.characterId}: ${e.signature} v${e.version}, ${e.sizeBytes} bytes`;
}
