import type { SymbolClassEntry } from './model';

/** Parses FFDec symbols.csv lines of the form `<id>;"<Class>"`. Id 0 is the root. */
export function parseSymbolsCsv(text: string): SymbolClassEntry[] {
  const entries: SymbolClassEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const m = /^(\d+)\s*;\s*"(.*)"$/.exec(line);
    if (!m) continue;
    entries.push({ id: Number(m[1]), className: m[2] });
  }
  return entries;
}

/** Inverse of parseSymbolsCsv: one `<id>;"<Class>"` line per entry, `\n` separated, trailing newline. */
export function formatSymbolsCsv(entries: readonly SymbolClassEntry[]): string {
  return entries.map((e) => `${e.id};"${e.className}"\n`).join('');
}
