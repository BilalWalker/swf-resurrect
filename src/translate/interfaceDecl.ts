// Pure: no node:*. Tells whether an AS3 source declares an interface (and so has no class to emit).
import { tokenize } from './tokenizer';

const BEFORE = new Set(['public', 'internal', '{', ';', '}']);

/** Name of the first `interface` declared in the source, or null. Comments and strings are skipped. */
export function as3InterfaceName(source: string): string | null {
  const toks = tokenize(source).filter((t) => t.kind !== 'comment');
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i];
    if (t.kind !== 'id' || t.text !== 'interface' || toks[i + 1].kind !== 'id') continue;
    const prev = toks[i - 1];
    if (prev === undefined || BEFORE.has(prev.text)) return toks[i + 1].text;
  }
  return null;
}
