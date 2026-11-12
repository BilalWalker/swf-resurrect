import type { SymbolClassEntry } from './model';
import { parseQualifiedName } from './qualifiedName';


/**
 * Parses FFDec symbols.csv lines of the form `<id>;"<Class>"`. Id 0 is the root.
 * Every class name is validated as a Qualified_Name and kept unchanged; an invalid one throws
 * InvalidClassNameError with the given stage.
 */
export function parseSymbolsCsv(text: string, stage: 'unpack' | 'convert' = 'convert'): SymbolClassEntry[] {
  const entries: SymbolClassEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const m = /^(\d+)\s*;\s*"(.*)"$/.exec(line);
    if (!m) continue;
    parseQualifiedName(m[2], stage); // throws InvalidClassNameError; the dotted string is kept unchanged
    entries.push({ id: Number(m[1]), className: m[2] });
  }
  return entries;
}

/** Inverse of parseSymbolsCsv: one `<id>;"<Class>"` line per entry, `\n` separated, trailing newline. */
export function formatSymbolsCsv(entries: readonly SymbolClassEntry[]): string {
  return entries.map((e) => `${e.id};"${e.className}"\n`).join('');
}
