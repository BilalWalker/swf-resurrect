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
  // A removal can expose a new match (`$A/-` loses `$A`, then `/-` is a root path), so repeat
  // until the text stops changing. Each pass only shortens the text, so this ends.
  let current = String(text);
  for (;;) {
    const next = scrubOnce(current);
    if (next === current) return next;
    current = next;
  }
}
function scrubOnce(text: string): string {
  const kept = text
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
  /** Present when the file holds more classes than the candidates (D-E1); states `<N> of <M> classes considered`. */
  considered?: { considered: number; total: number } | null;
  typeErrors: number;
  /** Registered classes kept with untranslated code; named in the sentence when > 0. */
  untranslatedCode?: number;
  gaps: GapSummary[];
  /** Present for a recovered run. */
  recovery?: { recovered: number; candidates: number } | null;
  /** Present when an embedded SWF was not converted. totalBytes null when unknown. */
  embedded?: { count: number; totalBytes: number | null } | null;
}

/** `the file is a wrapper around another SWF that was not converted (N embedded, X MiB); ` */
export function wrapperStatement(e: { count: number; totalBytes: number | null }): string {
  const size = e.totalBytes === null ? "" : `, ${(e.totalBytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `the file is a wrapper around another SWF that was not converted (${e.count} embedded${size}); `;
}

/** The two highest gap kinds: count descending, then kind name. */
export function topGaps(gaps: GapSummary[], n = 2): GapSummary[] {
  return [...gaps]
    .sort((a, b) => b.count - a.count || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
    .slice(0, n);
}
/** `<N> of <M> classes considered`; the numbers are the Outcome numbers, never a different count. */
export function consideredClause(c: { considered: number; total: number }): string {
  return `${c.considered} of ${c.total} classes considered`;
}

/**
 * `<T> of <N> classes translated (<N> of <M> classes considered) (<K> with untranslated code), <E> type errors; most gaps: <kind> (<n>), ...`.
 * The clause is present only when the file holds more classes than the candidates (D-E1).
 * A recovered run is prefixed `obfuscated: names renamed, N of M classes recovered; `.
 * Over 200 characters, in this order (D-E1): the gap part, the wrapper size, the untranslated-code part,
 * the type-error part, the wrapper statement. The recovery prefix, the translated count and the considered
 * clause are never cut.
 */
export function convertedWithGapsReason(input: GapsSentenceInput): string {
  const recovery = input.recovery
    ? `obfuscated: names renamed, ${input.recovery.recovered} of ${input.recovery.candidates} classes recovered; `
    : "";
  const untranslated = input.untranslatedCode ?? 0;
  const withCode = untranslated > 0 ? ` (${untranslated} with untranslated code)` : "";
  const clause = input.considered && input.considered.considered < input.considered.total ? ` (${consideredClause(input.considered)})` : "";
  const counts = `${input.translated} of ${input.candidates} classes translated${clause}`;
  const errors = `, ${input.typeErrors} type errors`;
  // The wrapper gap and the not-considered gap are already said by their own statements.
  const top = topGaps(input.gaps.filter((g) => g.kind !== "embedded-swf" && g.kind !== "classes-not-considered"));
  const gapPart = top.length > 0 ? `; most gaps: ${top.map((g) => `${g.kind} (${g.count})`).join(", ")}` : "";
  const full = wrapperStatement;
  const wrapper = input.embedded ?? null;
  const steps: Array<{ w: string; code: string; err: string; gaps: string }> = [];
  const w1 = wrapper ? full(wrapper) : "";
  const w2 = wrapper ? full({ count: wrapper.count, totalBytes: null }) : "";
  steps.push({ w: w1, code: withCode, err: errors, gaps: gapPart });
  steps.push({ w: w1, code: withCode, err: errors, gaps: "" });
  if (wrapper) steps.push({ w: w2, code: withCode, err: errors, gaps: "" });
  steps.push({ w: w2, code: "", err: errors, gaps: "" });
  steps.push({ w: w2, code: "", err: "", gaps: "" });
  steps.push({ w: "", code: "", err: "", gaps: "" });
  for (const s of steps) {
    const text = recovery + s.w + counts + s.code + s.err + s.gaps;
    if (text.length <= MAX_REASON_LENGTH) return text;
  }
  return truncateReason(recovery + counts);
}
