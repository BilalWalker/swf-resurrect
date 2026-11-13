// TypeScript emitter (design 1.3, 1.5). Pure: no node:* imports, no regular expressions.
//
// emitTs walks the scanner's structure nodes and assembles output text, LineSpan[]
// and Diagnostic[]. Token-level work (expression and type rewriting) is delegated
// to a `Rewriter` callback so rewrite.ts (task 7.1) can plug in. Constructor
// reordering and bind statements (task 8.1) plug in through `EmitHooks`.
//
// Contract with the callbacks:
//  - Token slices refer to the NORMALISED source (see normalizeNewlines) and may
//    contain comment tokens. `>>` and `>>>` are single tokens; rewriters that read
//    generics must run `splitAngleTokens` on the slice first.
//  - A rewriter reports "cannot translate this" by returning `unsupported`. The
//    emitter then rolls back everything the enclosing statement or member wrote and
//    emits that construct as `// AS3:` comments with one unsupported-construct
//    Diagnostic. Callbacks never need to know about spans.

import { normalizeNewlines, tokenize } from './tokenizer';
import type { Token } from './tokenizer';
import { scan } from './scanner';
import { collectFunctionLocals } from './implicitThis';
import type {
  AccessorNode, Body, ClassNode, Declarator, FieldNode, MethodNode, Node, Param,
  StatementNode, TokRange, UnsupportedNode, VarDecl,
} from './scanner';
import type { Diagnostic, LineSpan } from './types';

export interface TokenSlice {
  source: string;
  tokens: readonly Token[];
  /** Half-open range of indices into `tokens`. */
  from: number;
  to: number;
}

export type TypeRole = 'field' | 'param' | 'rest' | 'local' | 'return' | 'accessor';

export interface RewriteContext {
  /** 1-based line the construct starts on (used for Diagnostics when there are no tokens). */
  line: number;
  /** Set for `type`; absent for expressions. */
  role?: TypeRole;
  /** Names of the enclosing function's parameters and local variables (empty outside functions). */
  locals?: ReadonlySet<string>;
  /** True when the enclosing function's own body has a `return <expr>` (set for return types). */
  hasValueReturn?: boolean;
  /** The class member being emitted (method, accessor or field initialiser); absent outside a class. */
  member?: MemberContext;
}

export interface MemberContext {
  isStatic: boolean;
  /** Simple name of the enclosing class. */
  className: string;
}

export interface RewriteResult {
  text: string;
  diagnostics?: Diagnostic[];
  /** Set to make the enclosing statement or member unsupported (text is then ignored). */
  unsupported?: string;
}

export interface Rewriter {
  /** An expression (a condition, an initialiser, a whole expression statement, ...). */
  expression(slice: TokenSlice, ctx: RewriteContext): RewriteResult;
  /**
   * A type annotation (the tokens after the colon), or `null` when there is none.
   * Return '' to emit no annotation.
   */
  type(slice: TokenSlice | null, ctx: RewriteContext): RewriteResult;
  /**
   * AS3 default value text for an instance field declared without initialiser, or
   * `null` when the field is emitted with `declare` instead (design 1.5). Absent:
   * fields are emitted as written.
   */
  fieldDefault?(type: TokenSlice | null): string | null;
}

/** Copies source text unchanged. Used until rewrite.ts exists, and in tests. */
export const identityRewriter: Rewriter = {
  expression: (s) => ({ text: sliceText(s) }),
  type: (s) => ({ text: s === null ? '' : sliceText(s) }),
};

function sliceText(s: TokenSlice): string {
  return s.source.slice(s.tokens[s.from].start, s.tokens[s.to - 1].end);
}

export type BodyItem =
  | { kind: 'node'; node: Node }
  | { kind: 'generated'; text: string };

export interface EmitHooks {
  /** Lines emitted at the top of the file (the generated imports), in order. */
  importLines?(nodes: readonly Node[]): string[];
  /**
   * Replace a class constructor body. `ctor` is null when the class has none; a
   * non-null result then synthesises `constructor() { ... }`. Return null to keep
   * the constructor exactly as written.
   */
  constructorBody?(cls: ClassNode, ctor: MethodNode | null): BodyItem[] | null;
}

export interface EmitInput {
  /** Normalised source text (`\n` newlines). */
  source: string;
  tokens: readonly Token[];
  rewriter?: Rewriter;
  hooks?: EmitHooks;
}

export interface EmitOutput {
  /** LF endings, one trailing newline, '' when nothing was emitted. */
  text: string;
  spans: LineSpan[];
  diagnostics: Diagnostic[];
}

/** Convenience: normalise, tokenise, scan and emit. */
export function emitFromSource(source: string, rewriter?: Rewriter, hooks?: EmitHooks): EmitOutput {
  const src = normalizeNewlines(source);
  const tokens = tokenize(src);
  const { nodes } = scan(tokens);
  return emitTs(nodes, { source: src, tokens, rewriter, hooks });
}

export function emitTs(nodes: readonly Node[], input: EmitInput): EmitOutput {
  return new Emitter(input).run(nodes);
}

// ---------------------------------------------------------------------------

class UnsupportedSignal extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const MODIFIER_ORDER: readonly string[] = ['public', 'private', 'protected', 'static', 'override'];

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function escapeComment(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) out += '\\r';
    else if (c === 0x2028) out += '\\u2028';
    else if (c === 0x2029) out += '\\u2029';
    else out += text[i];
  }
  return out;
}

class Emitter {
  private readonly lines: string[] = [];
  private readonly spans: LineSpan[] = [];
  private readonly diags: Diagnostic[] = [];
  private readonly source: string;
  private readonly tokens: readonly Token[];
  private readonly rw: Rewriter;
  private readonly hooks: EmitHooks;
  /** Facts about the function being emitted, passed to the Rewriter. */
  private fn: { locals: ReadonlySet<string>; hasValueReturn: boolean } | null = null;
  /** Getters of the class being emitted, by name (for the accessor type check). */
  private getters: ReadonlyMap<string, AccessorNode> = new Map();
  /** The member being emitted, for implicit-this resolution. */
  private member: MemberContext | null = null;
  private curClass: ClassNode | null = null;

  constructor(input: EmitInput) {
    this.source = input.source;
    this.tokens = input.tokens;
    this.rw = input.rewriter ?? identityRewriter;
    this.hooks = input.hooks ?? {};
  }

  run(nodes: readonly Node[]): EmitOutput {
    const imports = this.hooks.importLines?.(nodes) ?? [];
    if (imports.length > 0) {
      for (const l of imports) this.lines.push(l);
      this.lines.push('');
    }
    this.nodeList(nodes, 0, null);
    while (this.lines.length > 0 && this.lines[this.lines.length - 1] === '') this.lines.pop();
    this.spans.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine || cmp(a.kind, b.kind));
    this.diags.sort((a, b) => a.line - b.line || cmp(a.kind, b.kind) || cmp(a.message, b.message));
    const text = this.lines.length === 0 ? '' : this.lines.join('\n') + '\n';
    return { text, spans: this.spans, diagnostics: this.diags };
  }

  // -- output helpers ------------------------------------------------------

  private ind(d: number): string {
    return '  '.repeat(d);
  }

  private push(d: number, text: string): void {
    const parts = text.split('\n');
    this.lines.push(this.ind(d) + parts[0]);
    for (let i = 1; i < parts.length; i++) this.lines.push(parts[i]);
  }

  private span(startLine: number, endLine: number, kind: LineSpan['kind']): void {
    this.spans.push({ startLine, endLine, kind });
  }

  private blankBefore(): void {
    const last = this.lines[this.lines.length - 1];
    if (last !== undefined && last !== '' && !last.endsWith('{')) this.lines.push('');
  }

  private slice(r: TokRange): TokenSlice {
    return { source: this.source, tokens: this.tokens, from: r.from, to: r.to };
  }

  private take(res: RewriteResult): string {
    if (res.unsupported !== undefined) throw new UnsupportedSignal(res.unsupported);
    if (res.diagnostics) for (const d of res.diagnostics) this.diags.push(d);
    return res.text;
  }

  private expr(r: TokRange): string {
    const line = this.tokens[r.from].line;
    return this.take(this.rw.expression(this.slice(r), {
      line, locals: this.fn?.locals, member: this.member ?? undefined,
    }));
  }

  private type(r: TokRange | null, line: number, role: TypeRole): string {
    const ctx: RewriteContext = {
      line, role, locals: this.fn?.locals, hasValueReturn: this.fn?.hasValueReturn, member: this.member ?? undefined,
    };
    return this.take(this.rw.type(r === null ? null : this.slice(r), ctx));
  }

  /** Type text without keeping its Diagnostics (used to compare accessor types). */
  private typeQuiet(r: TokRange | null, line: number, role: TypeRole): string {
    const res = this.rw.type(r === null ? null : this.slice(r), { line, role });
    if (res.unsupported !== undefined) throw new UnsupportedSignal(res.unsupported);
    return res.text;
  }

  /** True when `nodes` (and nested statement bodies) contain `return <expr>`. */
  private hasValueReturn(nodes: readonly Node[]): boolean {
    for (const n of nodes) {
      if (n.kind === 'statement') {
        if (n.stmt === 'return' && n.expr !== null) return true;
        if (n.body !== null && this.hasValueReturn(n.body.nodes)) return true;
        if (n.elseBody !== null && this.hasValueReturn(n.elseBody.nodes)) return true;
      } else if (n.kind === 'unsupported') {
        // Conservative: a return with a value inside commented-out code still counts.
        for (let i = n.range.from; i < n.range.to; i++) {
          const t = this.tokens[i];
          if (t.kind !== 'id' || t.text !== 'return') continue;
          let j = i + 1;
          while (j < n.range.to && this.tokens[j].kind === 'comment') j++;
          const nx = this.tokens[j];
          if (j < n.range.to && !(nx.kind === 'punct' && (nx.text === ';' || nx.text === '}'))) return true;
        }
      }
    }
    return false;
  }

  // -- node walk -----------------------------------------------------------

  private nodeList(nodes: readonly Node[], d: number, cls: ClassNode | null): void {
    for (const n of nodes) this.node(n, d, cls, '');
  }

  private node(n: Node, d: number, cls: ClassNode | null, prefix: string): void {
    switch (n.kind) {
      case 'comment': {
        this.span(n.startLine, n.endLine, 'comment');
        this.push(d, this.tokens[n.tokenIdx].text);
        return;
      }
      case 'import':
      case 'metadata':
        this.span(n.startLine, n.endLine, 'dropped');
        return;
      case 'package': {
        this.span(n.startLine, n.openLine, 'structural');
        this.nodeList(n.body, d, null);
        this.span(n.closeLine, n.closeLine, 'structural');
        return;
      }
      case 'unsupported':
        this.unsupported(n, n.reason, d, prefix);
        return;
      default:
        break;
    }
    const mark = { l: this.lines.length, s: this.spans.length, d: this.diags.length };
    try {
      this.supported(n, d, cls, prefix);
    } catch (e) {
      if (!(e instanceof UnsupportedSignal)) throw e;
      this.lines.length = mark.l;
      this.spans.length = mark.s;
      this.diags.length = mark.d;
      this.unsupported(n, e.reason, d, prefix);
      return;
    }
    if (n.trailing !== undefined && this.lines.length > 0) {
      this.lines[this.lines.length - 1] += ' ' + this.tokens[n.trailing].text;
    }
  }

  private supported(n: Exclude<Node, UnsupportedNode>, d: number, cls: ClassNode | null, prefix: string): void {
    switch (n.kind) {
      case 'class': return this.classNode(n, d);
      case 'field': return this.fieldNode(n, d);
      case 'method':
      case 'accessor':
        return this.functionNode(n, d, cls, null);
      case 'statement': return this.statement(n, d, prefix);
      default: return;
    }
  }

  // -- unsupported ---------------------------------------------------------

  private endOffset(n: Node): number {
    if (n.trailing !== undefined) return this.tokens[n.trailing].end;
    return this.tokens[n.range.to - 1].end;
  }

  private unsupported(n: Node, reason: string, d: number, prefix: string): void {
    const text = this.source.slice(this.tokens[n.range.from].start, this.endOffset(n));
    const inner = prefix === '' ? d : d + 1;
    if (prefix !== '') this.lines.push(this.ind(d) + prefix + '{');
    for (const l of text.split('\n')) {
      this.lines.push(this.ind(inner) + ('// AS3: ' + escapeComment(l)).trimEnd());
    }
    if (prefix !== '') this.lines.push(this.ind(d) + '}');
    this.span(n.startLine, n.endLine, 'unsupported');
    this.diags.push({ kind: 'unsupported-construct', line: n.startLine, message: reason });
  }

  // -- classes and members -------------------------------------------------

  private classNode(n: ClassNode, d: number): void {
    let head = `export class ${n.name}`;
    if (n.extendsName !== null) head += ` extends ${n.extendsName}`;
    if (n.implementsNames.length > 0) head += ` implements ${n.implementsNames.join(', ')}`;
    this.push(d, head + ' {');
    this.span(n.startLine, n.body.openLine, 'structural');
    const savedClass = this.curClass;
    this.curClass = n;
    try {
      this.classBody(n, d);
    } finally {
      this.curClass = savedClass;
    }
  }

  private classBody(n: ClassNode, d: number): void {
    const members = n.body.nodes;
    const getters = new Map<string, AccessorNode>();
    for (const m of members) if (m.kind === 'accessor' && m.accessor === 'get') getters.set(m.name, m);
    this.getters = getters;
    const ctor = members.find((m): m is MethodNode => m.kind === 'method' && m.isConstructor) ?? null;
    const plan = this.hooks.constructorBody?.(n, ctor) ?? null;
    let synthAt = -1;
    if (plan !== null && ctor === null) {
      synthAt = members.findIndex((m) => m.kind === 'method' || m.kind === 'accessor');
      if (synthAt < 0) synthAt = members.length;
    }
    for (let i = 0; i <= members.length; i++) {
      if (i === synthAt && plan !== null) this.synthConstructor(plan, d + 1);
      if (i === members.length) break;
      const m = members[i];
      if (m === ctor && plan !== null) this.node2(m, d + 1, n, plan);
      else this.node(m, d + 1, n, '');
    }
    this.push(d, '}');
    this.span(n.body.closeLine, n.body.closeLine, 'structural');
  }

  /** Emit the constructor with a replaced body, with the same rollback rule as `node`. */
  private node2(m: Node, d: number, cls: ClassNode, plan: BodyItem[]): void {
    const mark = { l: this.lines.length, s: this.spans.length, d: this.diags.length };
    try {
      this.functionNode(m as MethodNode, d, cls, plan);
    } catch (e) {
      if (!(e instanceof UnsupportedSignal)) throw e;
      this.lines.length = mark.l;
      this.spans.length = mark.s;
      this.diags.length = mark.d;
      this.unsupported(m, e.reason, d, '');
    }
  }

  private synthConstructor(plan: BodyItem[], d: number): void {
    this.blankBefore();
    this.push(d, 'constructor() {');
    this.bodyItems(plan, d + 1);
    this.push(d, '}');
  }

  private bodyItems(items: BodyItem[], d: number): void {
    for (const it of items) {
      if (it.kind === 'generated') this.push(d, it.text);
      else this.node(it.node, d, null, '');
    }
  }

  private modifiers(mods: readonly string[], isConst: boolean): string {
    let out = '';
    for (const m of MODIFIER_ORDER) if (mods.indexOf(m) >= 0) out += m + ' ';
    if (isConst) out += 'readonly ';
    return out;
  }

  private fieldNode(n: FieldNode, d: number): void {
    const mods = this.modifiers(n.modifiers, n.decl.isConst);
    const isStatic = n.modifiers.indexOf('static') >= 0;
    const savedMember = this.member;
    this.member = this.curClass === null ? null : { isStatic, className: this.curClass.name };
    try {
      this.fieldDeclarators(n, mods, isStatic, d);
    } finally {
      this.member = savedMember;
    }
    this.span(n.startLine, n.endLine, 'translated');
  }

  private fieldDeclarators(n: FieldNode, mods: string, isStatic: boolean, d: number): void {
    for (const dc of n.decl.declarators) {
      let dflt: string | null = null;
      let declare = false;
      if (dc.init === null && !n.decl.isConst && this.rw.fieldDefault !== undefined) {
        dflt = this.rw.fieldDefault(dc.type === null ? null : this.slice(dc.type));
        declare = dflt === null && !isStatic;
      }
      let text = this.declaratorText(dc, 'field', dflt);
      if (declare) text = 'declare ' + text;
      this.push(d, `${mods}${text};`);
    }
  }

  private declaratorText(dc: Declarator, role: TypeRole, dflt: string | null = null): string {
    const t = this.type(dc.type, dc.line, role);
    let s = dc.name + (t === '' ? '' : ': ' + t);
    if (dc.init !== null) s += ' = ' + this.expr(dc.init);
    else if (dflt !== null) s += ' = ' + dflt;
    return s;
  }

  private paramText(p: Param, typeOverride: string | null = null): string {
    const t = typeOverride ?? this.type(p.type, p.line, p.rest ? 'rest' : 'param');
    let s = (p.rest ? '...' : '') + p.name + (t === '' ? '' : ': ' + t);
    if (p.init !== null) s += ' = ' + this.expr(p.init);
    return s;
  }

  private functionNode(
    n: MethodNode | AccessorNode, d: number, cls: ClassNode | null, plan: BodyItem[] | null,
  ): void {
    const isCtor = n.kind === 'method' && n.isConstructor;
    const locals = collectFunctionLocals(n.params, n.body.nodes);
    const saved = this.fn;
    const savedMember = this.member;
    this.fn = { locals, hasValueReturn: this.hasValueReturn(n.body.nodes) };
    this.member = this.curClass === null
      ? null
      : { isStatic: n.modifiers.indexOf('static') >= 0, className: this.curClass.name };
    try {
      const isSetter = n.kind === 'accessor' && n.accessor === 'set';
      let override: string | null = null;
      if (isSetter && n.params.length === 1) override = this.setterTypeOverride(n);
      const params = n.params.map((p) => this.paramText(p, override)).join(', ');
      const ret = isCtor || isSetter
        ? ''
        : this.type(n.returnType, n.startLine, n.kind === 'accessor' ? 'accessor' : 'return');
      const name = isCtor ? 'constructor' : (n.kind === 'accessor' ? n.accessor + ' ' : '') + n.name;
      this.blankBefore();
      this.push(d, `${this.modifiers(n.modifiers, false)}${name}(${params})${ret === '' ? '' : ': ' + ret} {`);
      this.span(n.startLine, n.body.openLine, 'translated');
      if (plan !== null) this.bodyItems(plan, d + 1);
      else this.nodeList(n.body.nodes, d + 1, cls);
      this.push(d, '}');
      this.span(n.body.closeLine, n.body.closeLine, 'structural');
    } finally {
      this.fn = saved;
      this.member = savedMember;
    }
  }

  /**
   * For a setter whose getter has a different type: the getter's type, plus one
   * loose-type Diagnostic on the setter line (Req 3.6). Otherwise null.
   */
  private setterTypeOverride(setter: AccessorNode): string | null {
    const getter = this.getters.get(setter.name);
    if (getter === undefined) return null;
    const gt = this.typeQuiet(getter.returnType, getter.startLine, 'accessor');
    const p = setter.params[0];
    const st = this.typeQuiet(p.type, p.line, 'param');
    if (gt === st) return null;
    this.diags.push({
      kind: 'loose-type',
      line: setter.startLine,
      message: `setter "${setter.name}" takes ${st} but its getter returns ${gt}; using ${gt}`,
    });
    return gt;
  }

  // -- statements ----------------------------------------------------------

  private declText(decl: VarDecl): string {
    const kw = decl.isConst ? 'const' : 'var';
    return `${kw} ${decl.declarators.map((x) => this.declaratorText(x, 'local')).join(', ')}`;
  }

  /** Emit a body's statements at depth `d + 1`. */
  private bodyNodes(b: Body, d: number): void {
    this.nodeList(b.nodes, d + 1, null);
  }

  private closer(b: Body): void {
    if (b.braced) this.span(b.closeLine, b.closeLine, 'structural');
  }

  private statement(n: StatementNode, d: number, prefix: string): void {
    const p = prefix;
    const whole = (): void => this.span(n.startLine, n.endLine, 'translated');
    switch (n.stmt) {
      case 'empty':
        this.push(d, p + ';');
        return whole();
      case 'expr':
        this.push(d, `${p}${this.expr(n.expr as TokRange)};`);
        return whole();
      case 'var':
        this.push(d, `${p}${this.declText(n.decl as VarDecl)};`);
        return whole();
      case 'return':
      case 'throw': {
        const e = n.expr === null ? '' : ' ' + this.expr(n.expr);
        this.push(d, `${p}${n.stmt}${e};`);
        return whole();
      }
      case 'break':
      case 'continue':
        this.push(d, `${p}${n.stmt};`);
        return whole();
      case 'block': {
        const b = n.body as Body;
        this.push(d, p + '{');
        this.span(n.startLine, b.openLine, 'structural');
        this.bodyNodes(b, d);
        this.push(d, '}');
        this.closer(b);
        return;
      }
      case 'while': {
        const b = n.body as Body;
        this.push(d, `${p}while (${this.expr(n.expr as TokRange)}) {`);
        this.span(n.startLine, n.headEndLine, 'translated');
        this.bodyNodes(b, d);
        this.push(d, '}');
        this.closer(b);
        return;
      }
      case 'do': {
        const b = n.body as Body;
        const cond = this.expr(n.expr as TokRange);
        this.push(d, p + 'do {');
        this.span(n.startLine, n.headEndLine, 'translated');
        this.bodyNodes(b, d);
        this.push(d, `} while (${cond});`);
        this.span(b.closeLine, n.elseLine, 'translated');
        return;
      }
      case 'for': {
        const b = n.body as Body;
        const init = n.decl !== null ? this.declText(n.decl) : n.init === null ? '' : this.expr(n.init);
        const cond = n.expr === null ? '' : this.expr(n.expr);
        const step = n.step === null ? '' : this.expr(n.step);
        this.push(d, `${p}for (${init}; ${cond}; ${step}) {`);
        this.span(n.startLine, n.headEndLine, 'translated');
        this.bodyNodes(b, d);
        this.push(d, '}');
        this.closer(b);
        return;
      }
      case 'forIn': {
        const b = n.body as Body;
        const it = this.expr(n.iterable as TokRange);
        let head: string;
        if (n.decl !== null) {
          const name = n.decl.declarators[0].name;
          head = n.forEach ? `for (const ${name} of ${it})` : `for (var ${name} in ${it})`;
        } else {
          const lhs = this.expr(n.lhs as TokRange);
          head = `for (${lhs} ${n.forEach ? 'of' : 'in'} ${it})`;
        }
        this.push(d, `${p}${head} {`);
        this.span(n.startLine, n.headEndLine, 'translated');
        this.bodyNodes(b, d);
        this.push(d, '}');
        this.closer(b);
        return;
      }
      case 'if':
        return this.ifStatement(n, d, p);
      default:
        return;
    }
  }

  private ifStatement(n: StatementNode, d: number, p: string): void {
    const b = n.body as Body;
    this.push(d, `${p}if (${this.expr(n.expr as TokRange)}) {`);
    this.span(n.startLine, n.headEndLine, 'translated');
    this.bodyNodes(b, d);
    this.closer(b);
    const eb = n.elseBody;
    if (eb === null) {
      this.push(d, '}');
      return;
    }
    this.span(n.elseLine, n.elseOpenLine, 'structural');
    if (n.elseIf) {
      this.node(eb.nodes[0], d, null, '} else ');
      return;
    }
    this.push(d, '} else {');
    this.bodyNodes(eb, d);
    this.push(d, '}');
    this.closer(eb);
  }
}
