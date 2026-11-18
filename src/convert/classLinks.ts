// Pure. SymbolClass pairs to one link per character id (robustness Requirement 26.1 to 26.3, design D-D1).
import type { SymbolClassEntry } from './model';

export interface ClassLink {
  /** The class Ruffle instantiates the symbol with: the last pair for the id; for id 0 the first (the root class). */
  primary: string;
  /** Every other distinct name of the id, in first-seen tag order. */
  aliases: string[];
}

/**
 * Keeps the pairs that come from SymbolClassTag items. FFDec's symbols.csv lists those pairs first, in tag order, and
 * then the ExportAssetsTag pairs; the dump says how many pairs the SymbolClassTag items hold. Export pairs are not
 * AS3 class links (Ruffle ignores them), so they are dropped here. An undefined count keeps every entry.
 */
export function symbolClassPairs(entries: readonly SymbolClassEntry[], pairCount: number | undefined): SymbolClassEntry[] {
  return pairCount === undefined ? [...entries] : entries.slice(0, pairCount);
}

/** One link per id. Identical (id, name) pairs count once; never throws. */
export function buildClassLinks(entries: readonly SymbolClassEntry[]): Map<number, ClassLink> {
  const byId = new Map<number, string[]>();
  for (const e of entries) {
    const list = byId.get(e.id);
    if (list) list.push(e.className);
    else byId.set(e.id, [e.className]);
  }
  const links = new Map<number, ClassLink>();
  for (const [id, names] of byId) {
    const primary = id === 0 ? names[0] : names[names.length - 1];
    const aliases: string[] = [];
    for (const n of names) if (n !== primary && !aliases.includes(n)) aliases.push(n);
    links.set(id, { primary, aliases });
  }
  return links;
}
