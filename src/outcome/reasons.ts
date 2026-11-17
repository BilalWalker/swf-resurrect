import type { GapSummary, ReasonCode } from "./outcome";

export const MAX_REASON_LENGTH = 200;

const FFDEC_LINE = /ffdec|jpexs|java\.|javax\.|exception in thread|\bSEVERE\b|\bWARNING\b/i;
const STACK_LINE = /^\s*at\s.*$/;
const INLINE_FRAME = /\s+at\s+[^\s(]+\s*\([^)]*\)/g;
const WIN_PATH = /[A-Za-z]:[\\/][^\s"'<>|*?)]*/g;
const UNC_PATH = /\\\\[^\s"'<>|*?)]+/g;
const ROOT_PATH = /(^|[\s"'(=:])\/[\w.@-]+(?:\/[\w.@-]*)*/g;
const ENV_NAME = /%[A-Za-z_][A-Za-z0-9_]*%|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g;

/** Cut to at most 200 characters. */
export function truncateReason(text: string, max: number = MAX_REASON_LENGTH): string {
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * Remove what must not reach an Outcome: drive and root paths, stack lines, environment variable
 * names and FFDec stderr text. Result is one line of at most 200 characters.
 */
export function scrub(text: string): string {
  const kept = String(text)
    .split(/\r?\n/)
    .filter((line) => !STACK_LINE.test(line) && !FFDEC_LINE.test(line))
    .join(" ");
  const cleaned = kept
    .replace(INLINE_FRAME, "")
    .replace(WIN_PATH, "")
    .replace(UNC_PATH, "")
    .replace(ROOT_PATH, "$1")
    .replace(ENV_NAME, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncateReason(cleaned);
}

export interface ReasonParams {
  stage?: string;
  limit?: string;
}

/** Sentence templates for the refused and failed outcomes. */
export function reasonSentence(code: ReasonCode, params: ReasonParams = {}): string {
  switch (code) {
    case "not-swf":
      return "the file is not a SWF";
    case "damaged":
      return "the file could not be read";
    case "actionscript-1-2":
      return "the file uses ActionScript 1 or 2, which is not supported";
    case "encrypted":
      return "the file is encrypted";
    case "too-large":
      return "the file is larger than the size limit";
    case "time-limit": {
      const stage = params.stage ? scrub(params.stage) : "run";
      const limit = params.limit ? ` (${scrub(params.limit)})` : "";
      return scrub(`time limit reached in the ${stage} stage${limit}`);
    }
    case "nothing-translated":
      return "no class could be translated";
    case "internal-error":
      return "an internal error stopped the run";
  }
}

export interface GapsSentenceInput {
  translated: number;
  candidates: number;
  typeErrors: number;
  /** Registered classes kept with untranslated code; named in the sentence when > 0. */
  untranslatedCode?: number;
  gaps: GapSummary[];
  /** Present for a recovered run. */
  recovery?: { recovered: number; candidates: number } | null;
}

/** The two highest gap kinds: count descending, then kind name. */
export function topGaps(gaps: GapSummary[], n = 2): GapSummary[] {
  return [...gaps]
    .sort((a, b) => b.count - a.count || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
    .slice(0, n);
}

/**
 * `<N> of <M> classes translated, <E> type errors; most gaps: <kind> (<n>), <kind> (<n>)`.
 * A recovered run is prefixed `obfuscated: names renamed, N of M classes recovered; `.
 * Over 200 characters the gap part is dropped first (Requirement 16.4).
 */
export function convertedWithGapsReason(input: GapsSentenceInput): string {
  const prefix = input.recovery
    ? `obfuscated: names renamed, ${input.recovery.recovered} of ${input.recovery.candidates} classes recovered; `
    : "";
  const untranslated = input.untranslatedCode ?? 0;
  const withCode = untranslated > 0 ? ` (${untranslated} with untranslated code)` : "";
  const base = `${input.translated} of ${input.candidates} classes translated${withCode}, ${input.typeErrors} type errors`;
  const top = topGaps(input.gaps);
  const gapPart = top.length > 0 ? `; most gaps: ${top.map((g) => `${g.kind} (${g.count})`).join(", ")}` : "";
  const full = prefix + base + gapPart;
  if (full.length <= MAX_REASON_LENGTH) return full;
  return truncateReason(prefix + base);
}
