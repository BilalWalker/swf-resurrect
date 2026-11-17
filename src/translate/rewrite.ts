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
import type { ClassNode, InterfaceNode, Node, TokRange } from './scanner';
import type { Token } from './tokenizer';
import type { MemberContext, RewriteContext, RewriteResult, Rewriter, TokenSlice } from './emitTs';
import { isReference, resolveIdentifier } from './implicitThis';
import { instanceFieldType, lookupInstance, staticFieldType } from './memberTables';
import type { MemberKindFound, MemberTables } from './memberTables';
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
  /**
   * Receives every instance method of a translated class (own or of a translated superclass) that an
   * expression uses as a value, once per use, in source order (Requirement 22.13); used by the dry pass.
   */
  onMethodValue?: (className: string, name: string, inFieldInit: boolean) => void;
  /**
   * Classes whose value uses are read through `getDefinitionByName` (the import-cycle cut, Requirement 37.3).
   * Their import line is dropped or made type-only by the caller.
   */
  cutTargets?: ReadonlySet<QualifiedName>;
}

/** A value use of an imported class in an expression (Requirement 37.2): `cuttable` inside a method body or an instance field initialiser. */
export interface ClassUse {
  target: QualifiedName;
  cuttable: boolean;
}

/** Right-hand sides of `is` / `instanceof` that JS `instanceof` gets wrong. */
const PRIMITIVE_IS_TYPES: ReadonlySet<string> = new Set([
  'int', 'uint', 'Number', 'String', 'Boolean', 'Object', 'Array',
]);

/** Depth-0 tokens that end the left operand of `is`: operators that bind looser than a relational one. */
const OPERAND_STOPS: ReadonlySet<string> = new Set([
  '&&', '||', '?', ':', ',', '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '&&=', '||=',
  '==', '!=', '===', '!==', '&', '|', '^', '<', '>', '<=', '>=', ';',
]);
const ASSIGN_OPS: ReadonlySet<string> = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=',
]);
const OPERAND_STOP_WORDS: ReadonlySet<string> = new Set(['return', 'throw', 'case', 'in', 'is', 'as', 'instanceof', 'else']);

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
  const targetOfBinding = new Map<string, QualifiedName>();
  for (const p of options.plan.imports) targetOfBinding.set(p.binding, p.target);
  const env: ExprEnv = {
    options, classNames, bindingOf: (q) => bindingOfTarget.get(q) ?? null, targetOfBinding,
    cut: options.cutTargets ?? EMPTY_SET,
    usesDictionary: declaresDictionary(nodes),
  };
  // Forced imports and class uses in source order; the statement rollback of emitTs truncates it (design 21.8).
  const log: Array<{ forced: QualifiedName } | { use: ClassUse }> = [];
  return {
    forcedMark: () => log.length,
    forcedRollback: (n: number) => {
      log.length = Math.min(log.length, n);
    },
    forcedTargets: () => log.flatMap((e) => ('forced' in e ? [e.forced] : [])),
    classUses: () => log.flatMap((e) => ('use' in e ? [e.use] : [])),
    expression(slice: TokenSlice, ctx: RewriteContext): RewriteResult {
      const toks = sigTokens(slice);
      if (toks.length === 0) return { text: '' };
      const rw = new ExprRewriter(slice.source, toks, env, ctx.locals ?? EMPTY_SET, ctx.member ?? null, ctx.localTypes ?? EMPTY_MAP);
      try {
        const text = rw.run();
        for (const target of rw.importTargets) {
          log.push({ forced: target });
          options.onImportTarget?.(target);
        }
        for (const use of rw.classUses) log.push({ use });
        if (ctx.member !== undefined && options.onMethodValue !== undefined) {
          for (const name of rw.methodValues) options.onMethodValue(ctx.member.className, name, ctx.member.fieldInit === true);
        }
        return rw.diags.length > 0 ? { text, diagnostics: rw.diags } : { text };
      } catch (e) {
        if (e instanceof ExprError) return { text: '', unsupported: e.reason };
        throw e;
      }
    },
    type(slice: TokenSlice | null, ctx: RewriteContext): RewriteResult {
      return rewriteType(slice, ctx, (text) => options.plan.bindingOfChain.get(text) ?? null);
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
  const addNamed = (names: readonly string[], line: number): void => {
    for (const n of names) {
      if (n.indexOf('.') >= 0) {
        if (known.has(n)) chains.push({ text: n, qn: n, line });
        else addBare(n.slice(0, n.indexOf('.')), line);
      } else {
        addBare(n, line);
      }
    }
  };
  visitClasses(nodes, (c) => {
    declared.add(c.name);
    addNamed(c.implementsNames, c.startLine);
  });
  visitInterfaces(nodes, (i) => {
    declared.add(i.name);
    addNamed(i.extendsNames, i.startLine);
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
  /** Cut imports: 'drop' writes no line, 'type' writes `import type`. */
  cut: ReadonlyMap<QualifiedName, 'drop' | 'type'> = new Map(),
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
    const mode = cut.get(p.target);
    if (mode === 'drop') continue;
    const simple = p.target.slice(p.target.lastIndexOf('.') + 1);
    const text = p.aliased ? `${simple} as ${p.binding}` : simple;
    lines.push(`import ${mode === 'type' ? 'type ' : ''}{ ${text} } from '${spec}';`);
    records.push({
      line: lines.length,
      kind: 'class',
      names: [p.aliased ? { name: simple, alias: p.binding } : { name: simple }],
      target: p.target,
      ...(mode === 'type' ? { typeOnly: true } : {}),
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
      case 'interface':
        visitRanges(n.members, fn);
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

export function visitInterfaces(nodes: readonly Node[], fn: (i: InterfaceNode) => void): void {
  for (const n of nodes) {
    if (n.kind === 'package') visitInterfaces(n.body, fn);
    else if (n.kind === 'interface') fn(n);
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

// ---------------------------------------------------------------------------
// Types

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_MAP: ReadonlyMap<string, string> = new Map();

/** True when the file declares a field, parameter or local whose type is Dictionary. */
function declaresDictionary(nodes: readonly Node[]): boolean {
  const isDict = (t: string | null): boolean => t !== null && (t === 'Dictionary' || t.endsWith('.Dictionary'));
  const walk = (list: readonly Node[]): boolean => {
    for (const n of list) {
      switch (n.kind) {
        case 'package':
          if (walk(n.body)) return true;
          break;
        case 'class':
          if (walk(n.body.nodes)) return true;
          break;
        case 'field':
          if (n.decl.declarators.some((d) => isDict(d.typeText))) return true;
          break;
        case 'method':
        case 'accessor':
          if (n.params.some((p) => isDict(p.typeText)) || walk(n.body.nodes)) return true;
          break;
        case 'statement':
          if (n.decl !== null && n.decl.declarators.some((d) => isDict(d.typeText))) return true;
          if ((n.body !== null && walk(n.body.nodes)) || (n.elseBody !== null && walk(n.elseBody.nodes))) return true;
          break;
        default:
          break;
      }
    }
    return false;
  };
  return walk(nodes);
}

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
    case 'Class':
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
  targetOfBinding: ReadonlyMap<string, QualifiedName>;
  cut: ReadonlySet<QualifiedName>;
  /** The file declares something of type Dictionary: undecided index sites are then named (Requirement 13.6). */
  usesDictionary: boolean;
}

/** The registry read of a cut class; parenthesised so `new` and member access keep their meaning. */
function cutRead(target: QualifiedName): string {
  return `(getDefinitionByName('${target}'))`;
}

/** Key of a class of the file in the member tables (design 18.3): the file's Qualified_Name for the class named like the file. */
export function selfKey(self: QualifiedName, className: string): QualifiedName {
  const dot = self.lastIndexOf('.');
  if (self.slice(dot + 1) === className) return self;
  return dot < 0 ? className : `${self.slice(0, dot)}.${className}`;
}

/** An instance method of a translated class, own or inherited: not a static, a field, an accessor or a Shim member. */
function isBindableMethod(found: MemberKindFound): boolean {
  return found.kind === 'method' && (found.rule === 'own-instance' || found.rule === 'translated-super');
}

class ExprError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** Binding the import plan gives a dotted type name (design 21.8), or null when it has no source. */
type ChainBinding = (dotted: string) => string | null;
const noChain: ChainBinding = () => null;

interface Parsed {
  text: string;
  /** Wrap the already written operand that starts at token `from` (see `range`). */
  wrap?: { from: number; before: string; after: string };
  /** Index of the first token after the type. */
  next: number;
}

/**
 * Parse a type at `j`: `*`, a dotted name, or `Vector.<T>` (nested). Returns null
 * when the tokens are not a type. `>` tokens must already be split.
 */
function parseType(toks: readonly Token[], j: number, chain: ChainBinding = noChain): Parsed | null {
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
    const inner = parseType(toks, k + 2, chain);
    if (inner === null || !isP(toks, inner.next, '>')) return null;
    return { text: inner.text + '[]', next: inner.next + 1 };
  }
  return { text: k === j ? mapName(name) : (chain(name) ?? name), next: k + 1 };
}

function isP(toks: readonly Token[], i: number, text: string): boolean {
  const t = toks[i];
  return t !== undefined && t.kind === 'punct' && t.text === text;
}

function rewriteType(slice: TokenSlice | null, ctx: RewriteContext, chain: ChainBinding): RewriteResult {
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
  const parsed = parseType(toks as Token[], 0, chain);
  if (parsed === null || parsed.next !== (toks as Token[]).length) {
    return { text: '', unsupported: 'unsupported type annotation' };
  }
  return { text: admitNull(parsed.text) };
}

/** TypeScript text that already admits `null`, or that must not (Requirement 3.2): left as written. */
const NO_NULL_SUFFIX: ReadonlySet<string> = new Set(['number', 'boolean', 'void', 'any', 'never']);

/**
 * `T | null` for every AS3 reference type (Requirement 3.1, 3.9): classes, interfaces, `String`, `Array`,
 * `Vector`, `Function`. `int`, `uint`, `Number` and `Boolean` (`number`, `boolean`) and `void` stay as they
 * are; `any` (`Object`, `*`) already admits null. The text is the same whatever `strictNullChecks` is.
 */
export function admitNull(text: string): string {
  return NO_NULL_SUFFIX.has(text) ? text : `${text} | null`;
}

// ---------------------------------------------------------------------------
// Expressions

class ExprRewriter {
  readonly diags: Diagnostic[] = [];
  /** Methods this expression uses as values, in source order (Requirement 22.13). */
  readonly methodValues: string[] = [];
  /** Classes this expression wants imported; kept only when the expression is not unsupported. */
  readonly importTargets: string[] = [];
  /** Value uses of imported classes in this expression (for the import-cycle analysis). */
  readonly classUses: ClassUse[] = [];

  constructor(
    private readonly src: string,
    private readonly toks: readonly Token[],
    private readonly env: ExprEnv,
    private readonly locals: ReadonlySet<string>,
    private readonly member: MemberContext | null,
    private readonly localTypes: ReadonlyMap<string, string> = EMPTY_MAP,
  ) {
    this.opts = env.options;
  }

  private readonly opts: RewriteOptions;
  private readonly chainOfType: ChainBinding = (text) => this.opts.plan.bindingOfChain.get(text) ?? null;

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
    /** Output offset where each token's text starts (after the gap before it). */
    const starts = new Map<number, number>();
    while (i < hi) {
      const t = this.toks[i];
      out += this.src.slice(prevEnd, t.start);
      starts.set(i, out.length);
      const r = this.step(i, hi, lo);
      if (r.wrap !== undefined) {
        // A postfix type test: the operand is already written; surround it and drop the gap before the operator.
        const at = starts.get(r.wrap.from) ?? out.length;
        const operand = out.slice(at).trimEnd();
        out = out.slice(0, at) + r.wrap.before + operand + r.wrap.after;
      }
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

  private step(i: number, hi: number, lo: number): Parsed {
    const t = this.toks[i];
    if (t.kind !== 'id') return this.raw(i);
    if (i > 0 && (this.isP(i - 1, '.') || this.isP(i - 1, '::'))) return this.raw(i);
    const bound = this.chainBinding(i);
    if (bound !== null) return bound;
    const cutRef = this.classValue(i);
    if (cutRef !== null) return cutRef;
    if (t.text === 'this') this.noteExplicitThis(i);
    const dict = this.dictionaryIndex(i, hi);
    if (dict !== null) return dict;
    switch (t.text) {
      case 'int':
      case 'uint':
        return this.intCall(i, hi);
      case 'Vector':
        if (this.isP(i + 1, '.<')) return this.vector(i, hi);
        return this.raw(i);
      case 'is':
      case 'instanceof':
      case 'as':
        if (i > 0) return this.typeOperator(i, lo);
        return this.raw(i);
      case 'delete':
        this.checkDelete(i);
        return this.dictionaryDelete(i, hi) ?? this.raw(i);
      case 'in':
        if (i > 0) return this.dictionaryIn(i, lo, hi);
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
        if (r.importTarget !== null) {
          this.importTargets.push(r.importTarget);
          this.noteUse(r.importTarget);
          const binding = this.env.bindingOf(r.importTarget);
          if (this.env.cut.has(r.importTarget) && binding !== null && r.text.startsWith(binding + '.')) {
            return cutRead(r.importTarget) + r.text.slice(binding.length);
          }
        }
        if (isBindableMethod(r.found) && this.isValuePosition(i + 1)) this.methodValues.push(t.text);
        return r.text;
    }
  }

  /** True when the token at `next` does not make the preceding name a call or a member access. */
  private isValuePosition(next: number): boolean {
    return !this.isP(next, '(') && !this.isP(next, '.');
  }

  /** `this.name` used as a value, where `name` is an instance method of a translated class. */
  private noteExplicitThis(i: number): void {
    const member = this.member;
    const nameTok = this.toks[i + 2];
    if (member === null || member.isStatic || !this.isP(i + 1, '.') || nameTok === undefined || nameTok.kind !== 'id') {
      return;
    }
    if (!this.isValuePosition(i + 3)) return;
    const found = lookupInstance(this.opts.tables, selfKey(this.opts.self, member.className), nameTok.text);
    if (found !== null && isBindableMethod(found)) this.methodValues.push(nameTok.text);
  }

  /** A dotted chain that the import plan binds, unless its first identifier is a local. */
  private chainBinding(i: number): Parsed | null {
    if (this.opts.plan.bindingOfChain.size === 0 || this.locals.has(this.toks[i].text)) return null;
    let j = i;
    while (this.isP(j + 1, '.') && this.toks[j + 2] !== undefined && this.toks[j + 2].kind === 'id') j += 2;
    for (let k = j; k > i; k -= 2) {
      const text = this.toks.slice(i, k + 1).map((x) => x.text).join('');
      const binding = this.opts.plan.bindingOfChain.get(text);
      if (binding !== undefined) {
        const target = this.env.targetOfBinding.get(binding);
        if (target !== undefined) {
          this.noteUse(target);
          if (this.env.cut.has(target)) return { text: cutRead(target), next: k + 1 };
        }
        return { text: binding, next: k + 1 };
      }
    }
    return null;
  }

  /** Records a value use of an imported class. Cuttable inside a method body or an instance field initialiser. */
  private noteUse(target: QualifiedName): void {
    const m = this.member;
    this.classUses.push({ target, cuttable: m !== null && m.fieldInit !== false });
  }

  /** A bare identifier that is an imported class in a value position: noted, and read through the registry when cut. */
  private classValue(i: number): Parsed | null {
    const t = this.toks[i];
    const target = this.env.targetOfBinding.get(t.text);
    if (target === undefined || this.locals.has(t.text) || !isReference(this.toks, i)) return null;
    this.noteUse(target);
    return this.env.cut.has(target) ? { text: cutRead(target), next: i + 1 } : null;
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

  private vector(i: number, hi: number): Parsed {
    const inner = parseType(this.toks, i + 2, this.chainOfType);
    if (inner === null || !this.isP(inner.next, '>')) throw new ExprError('unsupported Vector type');
    const next = inner.next + 1;
    if (this.isId(i - 1, 'new')) return { text: `Array<${inner.text}>`, next };
    if (this.isP(next, '(')) return this.vectorCopy(i, inner, next, hi);
    return { text: inner.text + '[]', next };
  }

  /** `Vector.<T>(x)`: a copy of x as an array; int and uint elements go through the int and uint coercion. */
  private vectorCopy(i: number, inner: Parsed, open: number, hi: number): Parsed {
    const close = this.closeOf(open, hi);
    if (close === open + 1) throw new ExprError('Vector conversion call without an argument');
    let depth = 0;
    for (let q = open + 1; q < close; q++) {
      const t = this.toks[q];
      if (t.kind !== 'punct') continue;
      if (t.text === '(' || t.text === '[' || t.text === '{') depth++;
      else if (t.text === ')' || t.text === ']' || t.text === '}') depth--;
      else if (depth === 0 && t.text === ',') throw new ExprError('Vector conversion call with more than one argument');
    }
    const arg = this.range(open + 1, close);
    const elem = inner.next === i + 3 ? this.toks[i + 2].text : '';
    const op = elem === 'int' ? '| 0' : elem === 'uint' ? '>>> 0' : null;
    const text = op === null ? `Array.from(${arg})` : `Array.from(${arg}, (v: any) => (v ${op}))`;
    return { text, next: close + 1 };
  }

  // -- Dictionary index syntax (as3-coverage D10, Requirement 13.2, 13.6) --------------------------

  /**
   * The receiver that starts at token `i`: `this.name` or a bare name that is a parameter, a local or a field.
   * `kind` is `dict` when its declared type is Dictionary, `unknown` when it has no annotation or is `*` or
   * `Object` (a Dictionary may sit behind it), `other` for any other type. Null when it is none of these.
   * `text` resolves the written name (implicit `this`, inherited statics) and records the imports it needs.
   */
  private receiver(i: number): { kind: 'dict' | 'unknown' | 'other'; name: string; next: number; text: () => string } | null {
    const t = this.toks[i];
    if (t === undefined || t.kind !== 'id') return null;
    const classify = (declared: string | null): 'dict' | 'unknown' | 'other' | null => {
      if (declared === null) return null;
      if (declared === 'Dictionary' || declared.endsWith('.Dictionary')) return 'dict';
      return declared === '' || declared === '*' || declared === 'Object' ? 'unknown' : 'other';
    };
    const member = this.member;
    if (t.text === 'this') {
      const nameTok = this.toks[i + 2];
      if (member === null || member.isStatic || !this.isP(i + 1, '.') || nameTok === undefined || nameTok.kind !== 'id') return null;
      const kind = classify(instanceFieldType(this.opts.tables, selfKey(this.opts.self, member.className), nameTok.text));
      return kind === null ? null : { kind, name: nameTok.text, next: i + 3, text: () => `this.${nameTok.text}` };
    }
    if (!isReference(this.toks, i)) return null;
    if (this.locals.has(t.text)) {
      const kind = classify(this.localTypes.get(t.text) ?? '');
      return kind === null ? null : { kind, name: t.text, next: i + 1, text: () => t.text };
    }
    if (member === null || this.env.classNames.has(t.text)) return null;
    const self = selfKey(this.opts.self, member.className);
    const declared = member.isStatic
      ? staticFieldType(this.opts.tables, self, t.text)
      : (instanceFieldType(this.opts.tables, self, t.text) ?? staticFieldType(this.opts.tables, self, t.text));
    const kind = classify(declared);
    return kind === null ? null : { kind, name: t.text, next: i + 1, text: () => this.resolveHead(i) };
  }

  private undecided(name: string, line: number, form: string): void {
    this.diags.push({
      kind: 'loose-type',
      line,
      message: `Dictionary index: "${name}" is not known to be a Dictionary, so ${form} is left as index syntax`,
    });
  }

  /** `R[k]`, `R[k] = v` and `R[k] op= v` on a receiver typed Dictionary. Null when the tokens are not that. */
  private dictionaryIndex(i: number, hi: number): Parsed | null {
    const r = this.receiver(i);
    if (r === null || !this.isP(r.next, '[') || r.kind === 'other') return null;
    if (r.kind === 'unknown') {
      if (this.env.usesDictionary) this.undecided(r.name, this.toks[i].line, `"${r.name}[...]"`);
      return null;
    }
    const open = r.next;
    const close = this.closeOf(open, hi);
    if (close === open + 1) throw new ExprError('Dictionary index without a key');
    const recv = r.text();
    const key = this.range(open + 1, close);
    const after = this.toks[close + 1];
    if (after !== undefined && after.kind === 'punct' && (after.text === '++' || after.text === '--')) {
      throw new ExprError(`"${after.text}" on a Dictionary index cannot be translated`);
    }
    if (after !== undefined && after.kind === 'punct' && ASSIGN_OPS.has(after.text)) {
      const end = this.assignmentEnd(close + 2, hi);
      if (end === close + 2) throw new ExprError('Dictionary index assignment without a value');
      const value = this.range(close + 2, end);
      if (after.text === '=') return { text: `${recv}.set(${key}, ${value})`, next: end };
      if (!this.simpleKey(open + 1, close)) {
        throw new ExprError(`"${after.text}" on a Dictionary index with a computed key cannot be translated`);
      }
      const op = after.text.slice(0, -1);
      return { text: `${recv}.set(${key}, ${recv}.get(${key}) ${op} (${value}))`, next: end };
    }
    return { text: `${recv}.get(${key})`, next: close + 1 };
  }

  /** `delete R[k]` on a receiver typed Dictionary becomes `R.delete(k)`; null leaves the JS `delete`. */
  private dictionaryDelete(i: number, hi: number): Parsed | null {
    const r = this.receiver(i + 1);
    if (r === null || r.kind !== 'dict' || !this.isP(r.next, '[')) return null;
    const close = this.closeOf(r.next, hi);
    if (close === r.next + 1 || this.isP(close + 1, '.') || this.isP(close + 1, '[')) return null;
    return { text: `${r.text()}.delete(${this.range(r.next + 1, close)})`, next: close + 1 };
  }

  /** `k in R` on a receiver typed Dictionary becomes `R.has(k)`. */
  private dictionaryIn(i: number, lo: number, hi: number): Parsed {
    const r = this.receiver(i + 1);
    if (r === null || r.kind === 'other' || this.isP(r.next, '.') || this.isP(r.next, '[') || this.isP(r.next, '(')) return this.raw(i);
    if (r.kind === 'unknown') {
      if (this.env.usesDictionary) this.undecided(r.name, this.toks[i].line, `"in ${r.name}"`);
      return this.raw(i);
    }
    const from = this.operandStart(i, lo);
    if (from >= i || r.next > hi) throw new ExprError('"in" without an operand');
    return { text: '', next: r.next, wrap: { from, before: `${r.text()}.has(`, after: ')' } };
  }

  /** True when the key tokens `[lo, hi)` are names, literals and member access only (no call, no side effect). */
  private simpleKey(lo: number, hi: number): boolean {
    for (let q = lo; q < hi; q++) {
      const t = this.toks[q];
      if (t.kind === 'punct' && t.text !== '.') return false;
    }
    return true;
  }

  /** End of the assignment value that starts at `from`: before a depth-0 `,`, an unmatched `?:` colon or a closing bracket. */
  private assignmentEnd(from: number, hi: number): number {
    let depth = 0;
    let pending = 0;
    for (let q = from; q < hi; q++) {
      const t = this.toks[q];
      if (t.kind !== 'punct') continue;
      if (t.text === '(' || t.text === '[' || t.text === '{') depth++;
      else if (t.text === ')' || t.text === ']' || t.text === '}') {
        if (depth === 0) return q;
        depth--;
      } else if (depth === 0) {
        if (t.text === '?') pending++;
        else if (t.text === ':') {
          if (pending === 0) return q;
          pending--;
        } else if (t.text === ',' || t.text === ';') return q;
      }
    }
    return hi;
  }
  /** `delete` is kept as a JavaScript `delete` of a property; `delete x` of a plain name is not translatable. */
  private checkDelete(i: number): void {
    const operand = this.toks[i + 1];
    const named = operand !== undefined && operand.kind === 'id' && (this.isP(i + 2, '.') || this.isP(i + 2, '['));
    if (!named) throw new ExprError('"delete" of something other than a property access cannot be translated');
  }

  /** Start of the left operand of the type operator at `i`: after the nearest looser operator or open bracket, but not before `lo`. */
  private operandStart(i: number, lo: number): number {
    let depth = 0;
    for (let q = i - 1; q >= lo; q--) {
      const t = this.toks[q];
      if (t.kind === 'punct') {
        if (t.text === ')' || t.text === ']' || t.text === '}') depth++;
        else if (t.text === '(' || t.text === '[' || t.text === '{') {
          if (depth === 0) return q + 1;
          depth--;
        } else if (depth === 0 && OPERAND_STOPS.has(t.text)) return q + 1;
      } else if (t.kind === 'id' && depth === 0 && OPERAND_STOP_WORDS.has(t.text)) {
        return q + 1;
      }
    }
    return lo;
  }

  private typeOperator(i: number, lo: number): Parsed {
    const word = this.toks[i].text;
    if (i + 1 >= this.toks.length) throw new ExprError(`"${word}" without a type`);
    const rhs = parseType(this.toks, i + 1, this.chainOfType);
    if (rhs === null) throw new ExprError(`unsupported type after "${word}"`);
    if (word !== 'as') {
      const first = this.toks[i + 1].text;
      const single = rhs.next === i + 2;
      if (single && (first === 'Array' || first === 'Class')) {
        const from = this.operandStart(i, lo);
        if (from >= i) throw new ExprError(`"${word} ${first}" without an operand`);
        return first === 'Array'
          ? { text: '', next: rhs.next, wrap: { from, before: 'Array.isArray(', after: ')' } }
          : { text: '', next: rhs.next, wrap: { from, before: '(typeof ', after: ' === "function")' } };
      }
      if (single && PRIMITIVE_IS_TYPES.has(first)) {
        throw new ExprError(`"${word} ${first}" cannot be translated to instanceof`);
      }
      if (first === 'Vector') {
        throw new ExprError(`"${word} Vector" cannot be translated to instanceof`);
      }
    }
    if (word === 'is' && rhs.next === i + 2 && this.locals.has(this.toks[i + 1].text)) {
      // The class is a value held in a variable: JS instanceof is false for primitives, so the shim decides.
      const from = this.operandStart(i, lo);
      if (from >= i) throw new ExprError(`"${word} ${this.toks[i + 1].text}" without an operand`);
      return { text: '', next: rhs.next, wrap: { from, before: 'isInstanceOf(', after: `, ${this.toks[i + 1].text})` } };
    }
    const kw = word === 'as' ? 'as' : 'instanceof';
    let text = rhs.text;
    if (word !== 'as' && rhs.next === i + 2) {
      const target = this.env.targetOfBinding.get(text);
      if (target !== undefined && !this.locals.has(text)) {
        this.noteUse(target);
        if (this.env.cut.has(target)) text = cutRead(target);
      }
    }
    return { text: kw + this.gap(i) + text, next: rhs.next };
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
