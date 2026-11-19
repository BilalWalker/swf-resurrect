// String class names in AS3 source (design D-E2). Pure: no node:* imports.
// A class is created by name when code passes a string to getDefinitionByName or
// ApplicationDomain.getDefinition. The scan does not look at the call: every string
// literal (adjacent literals joined by `+` are folded) that equals the Qualified_Name of
// an exported class names it. A name built at run time is not seen.

import { normalizeNewlines, tokenize } from './tokenizer';

/** The string literals of `source`, with `"a" + "b"` folded to `ab`, in source order. Comments are skipped. */
export function stringLiterals(source: string): string[] {
  const toks = tokenize(normalizeNewlines(source)).filter((t) => t.kind !== 'comment');
  const out: string[] = [];
  const value = (text: string): string | null => {
    const q = text[0];
    if (text.length < 2 || (q !== '"' && q !== "'") || text[text.length - 1] !== q) return null;
    const body = text.slice(1, -1);
    return body.indexOf('\\') >= 0 ? null : body;
  };
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].kind !== 'str') continue;
    let v = value(toks[i].text);
    while (v !== null && toks[i + 1]?.text === '+' && toks[i + 2]?.kind === 'str') {
      const next = value(toks[i + 2].text);
      v = next === null ? null : v + next;
      i += 2;
    }
    if (v !== null && v !== '') out.push(v);
  }
  return out;
}

/** `pkg::Name` is written `pkg.Name`, the Qualified_Name form of the planner. */
function asQualified(literal: string): string {
  return literal.replace('::', '.');
}

/**
 * The exported classes (Qualified_Names) that the literals of `source` name, sorted by code unit.
 * A literal names a class only when it equals the whole Qualified_Name.
 */
export function namedClasses(source: string, exported: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  for (const lit of stringLiterals(source)) {
    const q = asQualified(lit);
    if (exported.has(q)) found.add(q);
  }
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
