// Transpiler entry points (design 1). Pure: no node:* imports, no regular
// expressions, no Date, no Math.random, no localeCompare.
//
// `translateCore` wires tokenizer, scanner, rewrite and emitTs, and installs the
// constructor hook (design 1.6) and method binding (design 1.7). `translate` adds
// the injected syntax check and the D5 fallback.

import { emitTs, escapeComment } from './emitTs';
import type { BodyItem, EmitHooks } from './emitTs';
import { createImportLines, createRewriter, findValueReferencedMethods } from './rewrite';
import { scan } from './scanner';
import type { ClassNode, MethodNode, Node } from './scanner';
import { normalizeNewlines, tokenize } from './tokenizer';
import type { Token } from './tokenizer';
import type { ClassInfo, TranslateOptions, TranslateResult } from './types';

/** True when `node` is the expression statement `super(...)`. */
function isSuperCall(tokens: readonly Token[], node: Node): boolean {
  if (node.kind !== 'statement' || node.stmt !== 'expr' || node.expr === null) return false;
  let i = node.expr.from;
  while (i < node.expr.to && tokens[i].kind === 'comment') i++;
  const a = tokens[i];
  if (a === undefined || a.kind !== 'id' || a.text !== 'super') return false;
  i++;
  while (i < node.expr.to && tokens[i].kind === 'comment') i++;
  const b = tokens[i];
  return b !== undefined && b.kind === 'punct' && b.text === '(';
}

function constructorHook(tokens: readonly Token[]): NonNullable<EmitHooks['constructorBody']> {
  return (cls: ClassNode, ctor: MethodNode | null): BodyItem[] | null => {
    const binds: BodyItem[] = findValueReferencedMethods(tokens, cls).map((m) => ({
      kind: 'generated',
      text: `this.${m.name} = this.${m.name}.bind(this);`,
    }));
    const extendsBase = cls.extendsName !== null;

    if (ctor === null) {
      if (binds.length === 0) return null;
      return extendsBase ? [{ kind: 'generated', text: 'super();' }, ...binds] : binds;
    }

    const body = ctor.body.nodes;
    const superIdx = extendsBase ? body.findIndex((n) => isSuperCall(tokens, n)) : -1;
    if (binds.length === 0 && (!extendsBase || superIdx === 0)) return null;

    const items: BodyItem[] = [];
    if (extendsBase) {
      items.push(superIdx >= 0 ? { kind: 'node', node: body[superIdx] } : { kind: 'generated', text: 'super();' });
    }
    items.push(...binds);
    body.forEach((n, i) => {
      if (i !== superIdx) items.push({ kind: 'node', node: n });
    });
    return items;
  };
}

function collectClasses(nodes: readonly Node[], out: ClassInfo[]): void {
  for (const n of nodes) {
    if (n.kind === 'package') collectClasses(n.body, out);
    else if (n.kind === 'class') out.push({ name: n.name, extendsName: n.extendsName });
  }
}

/** Decision D5: the whole file as `// AS3:` comments plus one line-1 Diagnostic. */
function fallback(source: string, firstMessage: string): TranslateResult {
  const lines = normalizeNewlines(source).split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const text = lines.map((l) => ('// AS3: ' + escapeComment(l)).trimEnd()).join('\n') + '\n';
  return {
    text,
    diagnostics: [
      {
        kind: 'unsupported-construct',
        line: 1,
        message: `translated output does not parse: ${firstMessage}`,
      },
    ],
    spans: [{ startLine: 1, endLine: lines.length, kind: 'unsupported' }],
    classes: [],
  };
}

/**
 * Translate one AS3 file, then run the injected syntax check (decisions D4, D5).
 * Blank or whitespace-only input returns empty text and skips the check.
 */
export function translate(source: string, options: TranslateOptions): TranslateResult {
  const result = translateCore(source, options);
  if (source.trim() === '') return result;
  const errors = options.syntaxCheck(result.text);
  if (errors.length === 0) return result;
  return fallback(source, errors[0].message);
}

/** Translate one AS3 file. Does not run the syntax check. */
export function translateCore(source: string, options: TranslateOptions): TranslateResult {
  const src = normalizeNewlines(source);
  const tokens = tokenize(src);
  const { nodes } = scan(tokens);
  const rwOptions = {
    shimNames: options.shimNames,
    shimMembers: options.shimMembers,
    siblingClasses: options.siblingClasses,
  };
  const out = emitTs(nodes, {
    source: src,
    tokens,
    rewriter: createRewriter(nodes, rwOptions),
    hooks: {
      importLines: createImportLines(tokens, rwOptions),
      constructorBody: constructorHook(tokens),
    },
  });
  const classes: ClassInfo[] = [];
  collectClasses(nodes, classes);
  return { text: out.text, diagnostics: out.diagnostics, spans: out.spans, classes };
}
