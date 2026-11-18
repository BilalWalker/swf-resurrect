// Pure. SymbolClass pairs to one link per character id (robustness Requirement 26.1 to 26.3, design D-D1).
import type { SymbolClassEntry } from './model';

export interface ClassLink {
  /** The class Ruffle instantiates the symbol with: the last pair for the id; for id 0 the first (the root class). */
  primary: string;
  /** Every other distinct name of the id, in first-seen tag order. */
  aliases: string[];
}

/**
 * The class links of a movie: the (id, name) pairs of the SymbolClassTag items in tag order. FFDec's symbols.csv
 * concatenates the pairs of SymbolClassTag and ExportAssetsTag items in file tag order, so no prefix of it is the
 * SymbolClass list. Export pairs are not AS3 class links (Ruffle ignores them). Without dump pairs (a model built
 * without a dump) every csv entry is kept.
 */
export function symbolClassPairs(
  csvEntries: readonly SymbolClassEntry[],
  dumpPairs: readonly SymbolClassEntry[] | undefined,
): SymbolClassEntry[] {
  return (dumpPairs ?? csvEntries).map((e) => ({ id: e.id, className: e.className }));
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
