// Core: no node:*, no clock, no randomness. Pure function of the file text.
// Which names a TypeScript module exports, read from its top-level `export` statements.
import { tokenize } from '../translate/tokenizer';

const DECLARATION = new Set(['class', 'function', 'const', 'let', 'var', 'enum', 'interface', 'type', 'namespace', 'module']);
const MODIFIER = new Set(['declare', 'abstract', 'async']);

/**
 * The exported names of a module's text, or null when they cannot be told: an `export *` without a
 * name, a destructuring export, or a token the lexer does not know (so brace depth cannot be trusted).
 * A file with no `export` gives an empty set (a comment-only file exports nothing).
 */
export function exportedNames(text: string): ReadonlySet<string> | null {
  const toks = tokenize(text).filter((t) => t.kind !== 'comment');
  if (toks.some((t) => t.kind === 'bad')) return null;
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind === 'punct') {
      if (t.text === '{') depth++;
      else if (t.text === '}') depth--;
      continue;
    }
    if (depth !== 0 || t.kind !== 'id' || t.text !== 'export') continue;
    let j = i + 1;
    const next = toks[j];
    if (next === undefined) break;
    if (next.text === 'default') {
      names.add('default');
      continue;
    }
    if (next.text === '*') {
      if (toks[j + 1]?.text === 'as' && toks[j + 2]?.kind === 'id') names.add(toks[j + 2].text);
      else return null;
      continue;
    }
    if (next.text === '{') {
      // export { a, b as c, type d } [from '...']
      for (j++; j < toks.length && toks[j].text !== '}'; j++) {
        if (toks[j].kind !== 'id') continue;
        let name = toks[j].text;
        if (name === 'type' && toks[j + 1]?.kind === 'id' && toks[j + 1].text !== 'as') name = toks[++j].text;
        if (toks[j + 1]?.text === 'as' && toks[j + 2]?.kind === 'id') {
          name = toks[j + 2].text;
          j += 2;
        }
        names.add(name);
      }
      continue;
    }
    while (toks[j] !== undefined && MODIFIER.has(toks[j].text)) j++;
    const kw = toks[j];
    if (kw === undefined || !DECLARATION.has(kw.text)) continue;
    j++;
    if (toks[j]?.text === '*') j++; // function*
    const nameTok = toks[j];
    if (nameTok === undefined) break;
    if (nameTok.kind === 'id') names.add(nameTok.text);
    else return null; // const { a } = ...
  }
  return names;
}
