// Expression and type rewriting (design 1.4, 1.5). Pure: no node:* imports, no
// regular expressions, no Date, no Math.random, no localeCompare.
//
// `createRewriter` returns the `Rewriter` that emitTs.ts calls for every expression
// and type annotation. It copies the source text between tokens unchanged and edits
// only the token patterns listed in the design. `createImportLines` writes the
// generated import lines. The helpers at the bottom (`visitRanges`,
// `collectOwnMethods`, `findValueReferencedMethods`) are reused by task 8.1.

import { canonicalClassPath, relativeSpecifier, shimSpecifier } from '../convert/qualifiedName';
import type { QualifiedName } from '../convert/qualifiedName';
import type { ImportDecl, ImportPlan } from './importPlan';
import { splitAngleTokens } from './scanner';
import type { ClassNode, MethodNode, Node, TokRange } from './scanner';
import type { Token } from './tokenizer';
import type { MemberContext, RewriteContext, RewriteResult, Rewriter, TokenSlice } from './emitTs';
import { isReference, resolveIdentifier } from './implicitThis';
import type { MemberTables } from './memberTables';
import type { Diagnostic, ImportRecord } from './types';

export interface RewriteOptions {
  /** AS3-visible names the Shim exports. */
  shimNames: ReadonlySet<string>;
  /** Import plan of this file: dotted chains are rewritten to their binding. */
  plan: ImportPlan;
  /** Member tables of every class with a source plus the Shim (Requirement 22). */
  tables: MemberTables;
  /** Qualified_Name of the file's class. */
  self: QualifiedName;
  /** Receives every class a resolution wants imported (inherited statics); used by the dry pass. */
  onImportTarget?: (target: QualifiedName) => void;
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
  const declared = new Set<string>();
  visitClasses(nodes, (c) => declared.add(c.name));
  const classNames = new Set<string>([...declared, ...options.shimNames, ...options.plan.bindingOfBare.keys()]);
  for (const p of options.plan.imports) classNames.add(p.binding);
  const bindingOfTarget = new Map<QualifiedName, string>();
  for (const p of options.plan.imports) bindingOfTarget.set(p.target, p.binding);
  const env: ExprEnv = { options, classNames, bindingOf: (q) => bindingOfTarget.get(q) ?? null };
  return {
    expression(slice: TokenSlice, ctx: RewriteContext): RewriteResult {
      const toks = sigTokens(slice);
      if (toks.length === 0) return { text: '' };
      const rw = new ExprRewriter(slice.source, toks, env, ctx.locals ?? EMPTY_SET, ctx.member ?? null);
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

/** What a file names: the input of `planFileImports` (design 14.3, step 2). */
export interface FileReferences {
  declared: Set<string>;
  imports: ImportDecl[];
  bare: Map<string, number>;
  chains: Array<{ text: string; qn: QualifiedName; line: number }>;
}

/**
 * Collects the declared class names, the import declarations, the bare identifiers
 * (not preceded by `.`, plus `implements` names) and the dotted chains that equal a
 * known Qualified_Name. The first identifier of a matched chain is not a bare name.
 */
export function collectReferences(
  tokens: readonly Token[], nodes: readonly Node[], known: ReadonlySet<QualifiedName>,
): FileReferences {
  const declared = new Set<string>();
  const imports: ImportDecl[] = [];
  const bare = new Map<string, number>();
  const chains: FileReferences['chains'] = [];
  const addBare = (name: string, line: number): void => {
    const prev = bare.get(name);
    if (prev === undefined || line < prev) bare.set(name, line);
  };
  const walkImports = (list: readonly Node[]): void => {
    for (const n of list) {
      if (n.kind === 'package') walkImports(n.body);
      else if (n.kind === 'import') imports.push({ path: n.path, wildcard: n.wildcard });
    }
  };
  walkImports(nodes);
  visitClasses(nodes, (c) => {
    declared.add(c.name);
    for (const n of c.implementsNames) {
      if (n.indexOf('.') >= 0) {
        if (known.has(n)) chains.push({ text: n, qn: n, line: c.startLine });
        else addBare(n.slice(0, n.indexOf('.')), c.startLine);
      } else {
        addBare(n, c.startLine);
      }
    }
  });
  visitRanges(nodes, (r) => {
    const sig: Token[] = [];
    for (let i = r.from; i < r.to; i++) if (tokens[i].kind !== 'comment') sig.push(tokens[i]);
    let i = 0;
    while (i < sig.length) {
      const t = sig[i];
      const prev = sig[i - 1];
      if (t.kind !== 'id' || (prev !== undefined && prev.kind === 'punct' && prev.text === '.')) {
        i++;
        continue;
      }
      let j = i;
      while (isP(sig, j + 1, '.') && sig[j + 2] !== undefined && sig[j + 2].kind === 'id') j += 2;
      let matched = false;
      for (let k = j; k > i; k -= 2) {
        const text = sig.slice(i, k + 1).map((x) => x.text).join('');
        if (known.has(text)) {
          chains.push({ text, qn: text, line: t.line });
          matched = true;
          break;
        }
      }
      if (!matched) addBare(t.text, t.line);
      i = j + 1;
    }
  });
  return { declared, imports, bare, chains };
}

/** The lines of the generated imports and their records (design 14.3, step 5). */
export function createImportLines(
  plan: ImportPlan, selfPath: string, shimUsed: readonly string[],
): { lines: string[]; records: ImportRecord[] } {
  const lines: string[] = [];
  const records: ImportRecord[] = [];
  const shim = [...shimUsed].sort(cmp);
  if (shim.length > 0) {
    lines.push(`import { ${shim.join(', ')} } from '${shimSpecifier(selfPath)}';`);
    records.push({ line: lines.length, kind: 'shim', names: shim.map((name) => ({ name })) });
  }
  const classes = plan.imports
    .map((p) => ({ p, spec: relativeSpecifier(selfPath, canonicalClassPath(p.target)) }))
    .sort((a, b) => cmp(a.spec, b.spec) || cmp(a.p.binding, b.p.binding));
  for (const { p, spec } of classes) {
    const simple = p.target.slice(p.target.lastIndexOf('.') + 1);
    const text = p.aliased ? `${simple} as ${p.binding}` : simple;
    lines.push(`import { ${text} } from '${spec}';`);
    records.push({
      line: lines.length,
      kind: 'class',
      names: [p.aliased ? { name: simple, alias: p.binding } : { name: simple }],
      target: p.target,
    });
  }
  return { lines, records };
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

interface ExprEnv {
  options: RewriteOptions;
  classNames: ReadonlySet<string>;
  bindingOf(q: QualifiedName): string | null;
}

/** Key of a class of the file in the member tables (design 18.3): the file's Qualified_Name for the class named like the file. */
function selfKey(self: QualifiedName, className: string): QualifiedName {
  const dot = self.lastIndexOf('.');
  if (self.slice(dot + 1) === className) return self;
  return dot < 0 ? className : `(${self.slice(0, dot)}.${className}`;
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
    private readonly env: ExprEnv,
    private readonly locals: ReadonlySet<string>,
    private readonly member: MemberContext | null,
  ) {
    this.opts = env.options;
  }

  private readonly opts: RewriteOptions;

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
    const bound = this.chainBinding(i);
    if (bound !== null) return bound;
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
    const head = this.resolveHead(i);
    const chain = this.parentChain(i, head);
    if (chain !== null) return chain;
    return { text: head, next: i + 1 };
  }

  /** The text of the identifier at i after implicit-this resolution (design 18.5). */
  private resolveHead(i: number): string {
    const t = this.toks[i];
    const member = this.member;
    if (member === null || !isReference(this.toks, i)) return t.text;
    const self = selfKey(this.opts.self, member.className);
    const r = resolveIdentifier(t.text, t.line, {
      tables: this.opts.tables,
      self,
      className: member.className,
      isStatic: member.isStatic,
      locals: this.locals,
      classNames: this.env.classNames,
      bindingOf: this.env.bindingOf,
    });
    switch (r.kind) {
      case 'leave':
        return t.text;
      case 'diagnose':
        this.diags.push(r.diagnostic);
        return t.text;
      default:
        if (r.importTarget !== null) this.opts.onImportTarget?.(r.importTarget);
        return r.text;
    }
  }

  /** A dotted chain that the import plan binds, unless its first identifier is a local. */
  private chainBinding(i: number): Parsed | null {
    if (this.opts.plan.bindingOfChain.size === 0 || this.locals.has(this.toks[i].text)) return null;
    let j = i;
    while (this.isP(j + 1, '.') && this.toks[j + 2] !== undefined && this.toks[j + 2].kind === 'id') j += 2;
    for (let k = j; k > i; k -= 2) {
      const text = this.toks.slice(i, k + 1).map((x) => x.text).join('');
      const binding = this.opts.plan.bindingOfChain.get(text);
      if (binding !== undefined) return { text: binding, next: k + 1 };
    }
    return null;
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
  private parentChain(i: number, head: string): Parsed | null {
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
      const text = `(${head}${this.src.slice(this.toks[i].end, this.toks[k].end)} as any)`;
      return { text, next: k + 1 };
    }
    return null;
  }
}
