// Expression and type rewriting (design 1.4, 1.5). Pure: no node:* imports, no
// regular expressions, no Date, no Math.random, no localeCompare.
//
// `createRewriter` returns the `Rewriter` that emitTs.ts calls for every expression
// and type annotation. It copies the source text between tokens unchanged and edits
// only the token patterns listed in the design. `createImportLines` returns the
// `EmitHooks.importLines` hook. The helpers at the bottom (`visitRanges`,
// `collectOwnMethods`, `findValueReferencedMethods`) are reused by task 8.1.

import { splitAngleTokens } from './scanner';
import type { ClassNode, MethodNode, Node, TokRange } from './scanner';
import type { Token } from './tokenizer';
import type { EmitHooks, RewriteContext, RewriteResult, Rewriter, TokenSlice } from './emitTs';
import type { Diagnostic } from './types';

export interface RewriteOptions {
  /** AS3-visible names the Shim exports. */
  shimNames: ReadonlySet<string>;
  /** MovieClip instance members callable unqualified. */
  shimMembers: ReadonlySet<string>;
  /** Other classes exported next to this file. */
  siblingClasses: ReadonlySet<string>;
}

/** Right-hand sides of `is` / `instanceof` that JS `instanceof` gets wrong. */
const PRIMITIVE_IS_TYPES: ReadonlySet<string> = new Set([
  'int', 'uint', 'Number', 'String', 'Boolean', 'Object', 'Array',
]);

/** Depth-0 operators that bind looser than `|` (they force `((X) | 0)`). */
const LOOSE_OPERATORS: ReadonlySet<string> = new Set([
  '||', '&&', '?', ',', '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=',
  '&&=', '||=',
]);

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Significant tokens of a slice, with `>>`/`>>>` split inside `.<...>`. */
function sigTokens(slice: TokenSlice): Token[] {
  return splitAngleTokens(slice.tokens.slice(slice.from, slice.to)).filter((t) => t.kind !== 'comment');
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Build the Rewriter for one file. `nodes` are the scanner's nodes for the same
 * file; they supply the own-method names used for `this.` qualification.
 */
export function createRewriter(nodes: readonly Node[], options: RewriteOptions): Rewriter {
  const own = collectOwnMethods(nodes);
  return {
    expression(slice: TokenSlice, ctx: RewriteContext): RewriteResult {
      const toks = sigTokens(slice);
      if (toks.length === 0) return { text: '' };
      const rw = new ExprRewriter(slice.source, toks, options, own, ctx.locals ?? EMPTY_SET);
      try {
        const text = rw.run();
        return rw.diags.length > 0 ? { text, diagnostics: rw.diags } : { text };
      } catch (e) {
        if (e instanceof ExprError) return { text: '', unsupported: e.reason };
        throw e;
      }
    },
    type(slice: TokenSlice | null, ctx: RewriteContext): RewriteResult {
      return rewriteType(slice, ctx);
    },
    fieldDefault(slice: TokenSlice | null): string | null {
      if (slice === null) return null;
      const toks = sigTokens(slice);
      if (toks.length !== 1 || toks[0].kind !== 'id') return null;
      switch (toks[0].text) {
        case 'int':
        case 'uint':
          return '0';
        case 'Number':
          return 'NaN';
        case 'Boolean':
          return 'false';
        default:
          return null;
      }
    },
  };
}

/**
 * `EmitHooks.importLines`: one `../shim` import listing the Shim names the file
 * references (sorted by code unit), then one `./Sibling` import per referenced
 * sibling class (sorted). Names of classes declared in the file are never imported.
 */
export function createImportLines(
  tokens: readonly Token[], options: RewriteOptions,
): NonNullable<EmitHooks['importLines']> {
  return (nodes) => {
    const declared = new Set<string>();
    const used = new Set<string>();
    visitClasses(nodes, (c) => {
      declared.add(c.name);
      for (const n of c.implementsNames) used.add(n);
    });
    visitRanges(nodes, (r) => {
      let prevDot = false;
      for (let i = r.from; i < r.to; i++) {
        const t = tokens[i];
        if (t.kind === 'comment') continue;
        if (t.kind === 'id' && !prevDot) used.add(t.text);
        prevDot = t.kind === 'punct' && t.text === '.';
      }
    });
    const shim: string[] = [];
    const sibs: string[] = [];
    for (const name of used) {
      if (declared.has(name)) continue;
      if (options.shimNames.has(name)) shim.push(name);
      else if (options.siblingClasses.has(name)) sibs.push(name);
    }
    shim.sort(cmp);
    sibs.sort(cmp);
    const lines: string[] = [];
    if (shim.length > 0) lines.push(`import { ${shim.join(', ')} } from '../shim';`);
    for (const s of sibs) lines.push(`import { ${s} } from './${s}';`);
    return lines;
  };
}

// ---------------------------------------------------------------------------
// Structure helpers (also used by task 8.1)

/** Call `fn` for every token range that holds expression or type text, skipping unsupported nodes. */
export function visitRanges(nodes: readonly Node[], fn: (r: TokRange) => void): void {
  for (const n of nodes) {
    switch (n.kind) {
      case 'package':
        visitRanges(n.body, fn);
        break;
      case 'class':
        if (n.extendsRange !== null) fn(n.extendsRange);
        visitRanges(n.body.nodes, fn);
        break;
      case 'field':
        for (const d of n.decl.declarators) {
          if (d.type !== null) fn(d.type);
          if (d.init !== null) fn(d.init);
        }
        break;
      case 'method':
      case 'accessor':
        for (const p of n.params) {
          if (p.type !== null) fn(p.type);
          if (p.init !== null) fn(p.init);
        }
        if (n.returnType !== null) fn(n.returnType);
        visitRanges(n.body.nodes, fn);
        break;
      case 'statement': {
        if (n.decl !== null) {
          for (const d of n.decl.declarators) {
            if (d.type !== null) fn(d.type);
            if (d.init !== null) fn(d.init);
          }
        }
        for (const r of [n.expr, n.init, n.step, n.lhs, n.iterable]) if (r !== null) fn(r);
        if (n.body !== null) visitRanges(n.body.nodes, fn);
        if (n.elseBody !== null) visitRanges(n.elseBody.nodes, fn);
        break;
      }
      default:
        break;
    }
  }
}

function visitClasses(nodes: readonly Node[], fn: (c: ClassNode) => void): void {
  for (const n of nodes) {
    if (n.kind === 'package') visitClasses(n.body, fn);
    else if (n.kind === 'class') fn(n);
  }
}

/** Names of non-static, non-constructor methods (accessors excluded) of every class in `nodes`. */
export function collectOwnMethods(nodes: readonly Node[]): ReadonlySet<string> {
  const out = new Set<string>();
  visitClasses(nodes, (c) => {
    for (const m of c.body.nodes) {
      if (m.kind === 'method' && !m.isConstructor && m.modifiers.indexOf('static') < 0) out.add(m.name);
    }
  });
  return out;
}

/**
 * Value-referenced methods (design 1.7): non-static, non-accessor methods declared
 * in `cls` that the class body names as `this . name` without a following `(`.
 * Returned in declaration order.
 */
export function findValueReferencedMethods(tokens: readonly Token[], cls: ClassNode): MethodNode[] {
  const methods: MethodNode[] = [];
  for (const m of cls.body.nodes) {
    if (m.kind === 'method' && !m.isConstructor && m.modifiers.indexOf('static') < 0) methods.push(m);
  }
  const referenced = new Set<string>();
  visitRanges(cls.body.nodes, (r) => {
    const sig: Token[] = [];
    for (let i = r.from; i < r.to; i++) if (tokens[i].kind !== 'comment') sig.push(tokens[i]);
    for (let k = 0; k + 2 < sig.length; k++) {
      const a = sig[k];
      if (a.kind !== 'id' || a.text !== 'this') continue;
      if (k > 0 && sig[k - 1].kind === 'punct' && sig[k - 1].text === '.') continue;
      const dot = sig[k + 1];
      const name = sig[k + 2];
      if (dot.kind !== 'punct' || dot.text !== '.' || name.kind !== 'id') continue;
      const after = sig[k + 3];
      if (after !== undefined && after.kind === 'punct' && after.text === '(') continue;
      referenced.add(name.text);
    }
  });
  const seen = new Set<string>();
  const out: MethodNode[] = [];
  for (const m of methods) {
    if (referenced.has(m.name) && !seen.has(m.name)) {
      seen.add(m.name);
      out.push(m);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Types

const EMPTY_SET: ReadonlySet<string> = new Set();

function mapName(name: string): string {
  switch (name) {
    case 'int':
    case 'uint':
    case 'Number':
      return 'number';
    case 'String':
      return 'string';
    case 'Boolean':
      return 'boolean';
    case 'Object':
      return 'any';
    case 'Array':
      return 'any[]';
    case 'Vector':
      return 'any[]';
    default:
      return name;
  }
}

class ExprError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

interface Parsed {
  text: string;
  /** Index of the first token after the type. */
  next: number;
}

/**
 * Parse a type at `j`: `*`, a dotted name, or `Vector.<T>` (nested). Returns null
 * when the tokens are not a type. `>` tokens must already be split.
 */
function parseType(toks: readonly Token[], j: number): Parsed | null {
  const t = toks[j];
  if (t === undefined) return null;
  if (t.kind === 'punct' && t.text === '*') return { text: 'any', next: j + 1 };
  if (t.kind !== 'id') return null;
  let k = j;
  let name = t.text;
  while (isP(toks, k + 1, '.') && toks[k + 2] !== undefined && toks[k + 2].kind === 'id') {
    name += '.' + toks[k + 2].text;
    k += 2;
  }
  if (isP(toks, k + 1, '.<')) {
    if (t.text !== 'Vector' && toks[k].text !== 'Vector') return null;
    const inner = parseType(toks, k + 2);
    if (inner === null || !isP(toks, inner.next, '>')) return null;
    return { text: inner.text + '[]', next: inner.next + 1 };
  }
  return { text: k === j ? mapName(name) : name, next: k + 1 };
}

function isP(toks: readonly Token[], i: number, text: string): boolean {
  const t = toks[i];
  return t !== undefined && t.kind === 'punct' && t.text === text;
}

function rewriteType(slice: TokenSlice | null, ctx: RewriteContext): RewriteResult {
  const role = ctx.role ?? 'local';
  const toks = slice === null ? null : sigTokens(slice);
  const absent = toks === null || toks.length === 0;
  const star = toks !== null && toks.length === 1 && toks[0].kind === 'punct' && toks[0].text === '*';
  const loose = (what: string): Diagnostic => ({ kind: 'loose-type', line: ctx.line, message: what });

  if (role === 'rest') {
    return { text: 'any[]', diagnostics: [loose('rest parameter is typed any[]')] };
  }
  if (role === 'return' && (absent || star)) {
    if (ctx.hasValueReturn !== true) return { text: 'void' };
    return { text: 'any', diagnostics: [loose('return type is not annotated; emitted as any')] };
  }
  if (absent || star) {
    const what = absent ? 'missing type annotation; emitted as any' : 'type * is emitted as any';
    return { text: 'any', diagnostics: [loose(what)] };
  }
  const parsed = parseType(toks as Token[], 0);
  if (parsed === null || parsed.next !== (toks as Token[]).length) {
    return { text: '', unsupported: 'unsupported type annotation' };
  }
  return { text: parsed.text };
}

// ---------------------------------------------------------------------------
// Expressions

class ExprRewriter {
  readonly diags: Diagnostic[] = [];

  constructor(
    private readonly src: string,
    private readonly toks: readonly Token[],
    private readonly opts: RewriteOptions,
    private readonly own: ReadonlySet<string>,
    private readonly locals: ReadonlySet<string>,
  ) {}

  run(): string {
    return this.range(0, this.toks.length);
  }

  private isP(i: number, text: string): boolean {
    return isP(this.toks, i, text);
  }

  private isId(i: number, text: string): boolean {
    const t = this.toks[i];
    return t !== undefined && t.kind === 'id' && t.text === text;
  }

  /** Rewrite tokens `[lo, hi)`, copying the source text between them. */
  private range(lo: number, hi: number): string {
    if (lo >= hi) return '';
    let out = '';
    let prevEnd = this.toks[lo].start;
    let i = lo;
    while (i < hi) {
      const t = this.toks[i];
      out += this.src.slice(prevEnd, t.start);
      const r = this.step(i, hi);
      out += r.text;
      prevEnd = this.toks[r.next - 1].end;
      i = r.next;
    }
    return out;
  }

  private raw(i: number): Parsed {
    return { text: this.toks[i].text, next: i + 1 };
  }

  private gap(i: number): string {
    return this.src.slice(this.toks[i].end, this.toks[i + 1].start);
  }

  private step(i: number, hi: number): Parsed {
    const t = this.toks[i];
    if (t.kind !== 'id') return this.raw(i);
    if (i > 0 && (this.isP(i - 1, '.') || this.isP(i - 1, '::'))) return this.raw(i);
    switch (t.text) {
      case 'int':
      case 'uint':
        return this.intCall(i, hi);
      case 'Vector':
        if (this.isP(i + 1, '.<')) return this.vector(i);
        return this.raw(i);
      case 'is':
      case 'instanceof':
      case 'as':
        if (i > 0) return this.typeOperator(i);
        return this.raw(i);
      default:
        break;
    }
    const chain = this.parentChain(i);
    if (chain !== null) return chain;
    if (this.isP(i + 1, '(') && this.qualifies(i)) return { text: 'this.' + t.text, next: i + 1 };
    return this.raw(i);
  }

  private qualifies(i: number): boolean {
    const name = this.toks[i].text;
    if (!this.opts.shimMembers.has(name) && !this.own.has(name)) return false;
    if (this.locals.has(name)) return false;
    return !(this.isId(i - 1, 'function') || this.isId(i - 1, 'new'));
  }

  private closeOf(open: number, hi: number): number {
    let depth = 0;
    for (let q = open; q < hi; q++) {
      const t = this.toks[q];
      if (t.kind !== 'punct') continue;
      if (t.text === '(' || t.text === '[' || t.text === '{') depth++;
      else if (t.text === ')' || t.text === ']' || t.text === '}') {
        depth--;
        if (depth === 0) return q;
      }
    }
    throw new ExprError('unbalanced parentheses');
  }

  private intCall(i: number, hi: number): Parsed {
    const word = this.toks[i].text;
    if (!this.isP(i + 1, '(')) throw new ExprError(`"${word}" used as a value`);
    const close = this.closeOf(i + 1, hi);
    if (close === i + 2) throw new ExprError(`${word}() without an argument`);
    const inner = this.range(i + 2, close);
    const op = word === 'int' ? '| 0' : '>>> 0';
    const text = this.needsWrap(i + 2, close) ? `((${inner}) ${op})` : `(${inner} ${op})`;
    return { text, next: close + 1 };
  }

  /** True when a depth-0 token in `[lo, hi)` binds looser than `|` (or is a TS `as`). */
  private needsWrap(lo: number, hi: number): boolean {
    let depth = 0;
    for (let q = lo; q < hi; q++) {
      const t = this.toks[q];
      if (t.kind === 'punct') {
        if (t.text === '(' || t.text === '[' || t.text === '{') depth++;
        else if (t.text === ')' || t.text === ']' || t.text === '}') depth--;
        else if (depth === 0 && LOOSE_OPERATORS.has(t.text)) return true;
      } else if (t.kind === 'id' && depth === 0 && t.text === 'as') {
        return true;
      }
    }
    return false;
  }

  private vector(i: number): Parsed {
    const inner = parseType(this.toks, i + 2);
    if (inner === null || !this.isP(inner.next, '>')) throw new ExprError('unsupported Vector type');
    const next = inner.next + 1;
    if (this.isId(i - 1, 'new')) return { text: `Array<${inner.text}>`, next };
    if (this.isP(next, '(')) throw new ExprError('Vector conversion call is not supported');
    return { text: inner.text + '[]', next };
  }

  private typeOperator(i: number): Parsed {
    const word = this.toks[i].text;
    if (i + 1 >= this.toks.length) throw new ExprError(`"${word}" without a type`);
    const rhs = parseType(this.toks, i + 1);
    if (rhs === null) throw new ExprError(`unsupported type after "${word}"`);
    if (word !== 'as') {
      const first = this.toks[i + 1].text;
      const single = rhs.next === i + 2;
      if (single && PRIMITIVE_IS_TYPES.has(first)) {
        throw new ExprError(`"${word} ${first}" cannot be translated to instanceof`);
      }
      if (first === 'Vector') {
        throw new ExprError(`"${word} Vector" cannot be translated to instanceof`);
      }
    }
    const kw = word === 'as' ? 'as' : 'instanceof';
    return { text: kw + this.gap(i) + rhs.text, next: rhs.next };
  }

  /**
   * `<chain>.parent.<member>` with `<chain>` an identifier chain: wrap the part up
   * to and including `parent` as `(<chain>.parent as any)` and report one loose-type.
   */
  private parentChain(i: number): Parsed | null {
    let j = i;
    while (this.isP(j + 1, '.') && this.toks[j + 2] !== undefined && this.toks[j + 2].kind === 'id') j += 2;
    for (let k = i + 2; k < j; k += 2) {
      if (this.toks[k].text !== 'parent') continue;
      const line = this.toks[k].line;
      const member = this.toks[k + 2].text;
      this.diags.push({
        kind: 'loose-type',
        line,
        message: `".parent.${member}" is not statically typed; parent is cast to any`,
      });
      const text = `(${this.src.slice(this.toks[i].start, this.toks[k].end)} as any)`;
      return { text, next: k + 1 };
    }
    return null;
  }
}
