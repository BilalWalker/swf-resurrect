import type { GapKind, GapSummary } from "./outcome";
import { scrub } from "./reasons";

export const MAX_GAP_EXAMPLES = 5;

/** Kinds that count as a Gap (D-A3). */
export const COUNTED_GAP_KINDS: readonly GapKind[] = [
  "untranslated-class",
  "class-omitted",
  "untranslated-code",
  "unbound-instance",
  "unrecoverable-class",
  "type-error",
  "dropped-placement",
  "flash-api-gap",
  "embedded-swf",
];

/** Named_Limits only: never counted as a Gap. */
export const NAMED_LIMIT_KINDS: readonly string[] = ["text-metrics", "filter", "stroke-style", "mask", "morph-shape", "obfuscation-recovered"];

export interface GapEntry {
  kind: string;
  example?: string;
}

export interface GapExtras {
  typeErrors?: number;
  typeErrorExamples?: string[];
  droppedPlacements?: number;
  /** One gap entry: count is the number of embedded SWFs, examples are generic (id, signature, size). */
  embeddedSwfs?: { count: number; examples: string[] };
}

const counted = new Set<string>(COUNTED_GAP_KINDS);

/**
 * One element per kind that occurs, with the true count and at most 5 examples. Entries of other
 * kinds (the Named_Limits) are ignored. Order: count descending, then kind name.
 */
export function summariseGaps(entries: readonly GapEntry[], extras: GapExtras = {}): GapSummary[] {
  const byKind = new Map<GapKind, GapSummary>();
  const add = (kind: GapKind, n: number, example?: string): void => {
    if (n <= 0) return;
    let g = byKind.get(kind);
    if (!g) {
      g = { kind, count: 0, examples: [] };
      byKind.set(kind, g);
    }
    g.count += n;
    if (example !== undefined && g.examples.length < MAX_GAP_EXAMPLES) {
      const s = scrub(example);
      if (s !== "") g.examples.push(s);
    }
  };
  for (const e of entries) {
    if (counted.has(e.kind)) add(e.kind as GapKind, 1, e.example);
  }
  const te = extras.typeErrors ?? 0;
  if (te > 0) {
    add("type-error", te);
    const g = byKind.get("type-error");
    for (const ex of extras.typeErrorExamples ?? []) {
      if (g && g.examples.length < MAX_GAP_EXAMPLES) {
        const s = scrub(ex);
        if (s !== "") g.examples.push(s);
      }
    }
  }
  add("dropped-placement", extras.droppedPlacements ?? 0);
  const emb = extras.embeddedSwfs;
  if (emb && emb.count > 0) {
    add("embedded-swf", emb.count);
    const g = byKind.get("embedded-swf");
    for (const ex of emb.examples) {
      if (g && g.examples.length < MAX_GAP_EXAMPLES) {
        const s = scrub(ex);
        if (s !== "") g.examples.push(s);
      }
    }
  }
  return [...byKind.values()].sort((a, b) => b.count - a.count || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}
