/**
 * Facts_Reader (robustness design, "Facts_Reader"). Pure: the caller reads the file and passes a zlib inflate
 * function, so this module imports no node:* module. Never throws for any input bytes.
 */
import type { Facts, ReasonCode } from "../outcome/outcome";
import { detectEmbeddedSwfs, type EmbeddedSwf } from "./embeddedSwf";
import { parseBody, scriptVersionOf, type TagRange } from "./swfBody";

/** Declared decompressed length above this is refused `too-large` (chosen, not measured). */
export const MAX_UNCOMPRESSED = 128 * 1024 * 1024;

export interface FactsLimits {
  /** Largest accepted file, in bytes. */
  maxSizeBytes: number;
}

/** Inflates a zlib stream and throws if it is truncated, invalid or longer than `maxOutputLength`. */
export type InflateFn = (data: Uint8Array, maxOutputLength: number) => Uint8Array;

export type FactsResult =
  | { ok: true; facts: Facts; body: Uint8Array; abcRanges: TagRange[]; embeddedSwfs: EmbeddedSwf[] }
  | { ok: false; reasonCode: ReasonCode; facts: Facts | null };

const HEADER_SOURCE = [
  "signature",
  "version",
  "compression",
  "sizeBytes",
  "declaredLength",
  "stage",
  "frameRate",
  "declaredFrames",
  "scriptVersion",
];

export function readFacts(bytes: Uint8Array, limits: FactsLimits, inflate: InflateFn): FactsResult {
  // Step 1
  if (bytes.length < 8) return { ok: false, reasonCode: "not-swf", facts: null };
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (sig !== "FWS" && sig !== "CWS" && sig !== "ZWS") return { ok: false, reasonCode: "not-swf", facts: null };

  const declaredLength = (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;
  const facts: Facts = {
    signature: sig,
    version: bytes[3],
    compression: sig === "FWS" ? "none" : sig === "CWS" ? "zlib" : "lzma",
    sizeBytes: bytes.length,
    declaredLength,
    stage: null,
    frameRate: null,
    declaredFrames: null,
    scriptVersion: "unknown",
    abcClassCount: null,
    source: { header: HEADER_SOURCE.slice(), ffdec: [] },
  };

  // Step 2 and the declared length cap of step 3
  if (bytes.length > limits.maxSizeBytes) return { ok: false, reasonCode: "too-large", facts };
  if (declaredLength > MAX_UNCOMPRESSED) return { ok: false, reasonCode: "too-large", facts };

  // Step 3: ZWS is header facts only (no LZMA decoder).
  if (sig === "ZWS") {
    facts.source.header = ["signature", "version", "compression", "sizeBytes", "declaredLength"];
    return { ok: true, facts, body: new Uint8Array(0), abcRanges: [], embeddedSwfs: [] };
  }

  let body: Uint8Array;
  if (sig === "FWS") {
    body = bytes.subarray(8);
  } else {
    if (declaredLength < 8) return { ok: false, reasonCode: "damaged", facts };
    try {
      body = inflate(bytes.subarray(8), Math.min(declaredLength, MAX_UNCOMPRESSED));
    } catch {
      return { ok: false, reasonCode: "damaged", facts };
    }
  }

  // Step 4
  if (body.length + 8 !== declaredLength) return { ok: false, reasonCode: "damaged", facts };

  // Step 5
  const info = parseBody(body);
  if (info === null) return { ok: false, reasonCode: "damaged", facts };
  facts.stage = info.stage;
  facts.frameRate = info.frameRate;
  facts.declaredFrames = info.declaredFrames;

  // Step 6
  facts.scriptVersion = scriptVersionOf(info.tagCodes);
  if (facts.scriptVersion === "as1-2") return { ok: false, reasonCode: "actionscript-1-2", facts };
  return { ok: true, facts, body, abcRanges: info.abcRanges, embeddedSwfs: detectEmbeddedSwfs(body, info.binaryRanges) };
}
