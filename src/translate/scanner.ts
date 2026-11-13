// Statement scanner (design 1.2). Pure: no node:* imports, no regular expressions.
//
// The scanner turns the token stream into structure nodes. It never produces text.
// Nodes carry token ranges into the FULL token array (comments included), so a
// range maps back to a source slice, and `startLine`/`endLine` for line accounting.
//
// Failure rule: anything the scanner does not understand becomes an `unsupported`
// node covering the construct, so the emitter can keep it as `// AS3:` comments.

import type { Token } from './tokenizer';

/** Half-open range `[from, to)` of indices into the full token array. */
export interface TokRange {
  from: number;
  to: number;
}

interface NodeBase {
  range: TokRange;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  /** Index of a comment token that trails this node on its last line. */
  trailing?: number;
}

export interface Declarator {
  name: string;
  /** Full-token index of the name. */
  nameIdx: number;
  line: number;
  type: TokRange | null;
  init: TokRange | null;
}

export interface VarDecl {
  isConst: boolean;
  declarators: Declarator[];
}

export interface Param {
  name: string;
  rest: boolean;
  line: number;
  type: TokRange | null;
  init: TokRange | null;
}

/** A `{...}` body, or a single unbraced statement (always emitted in braces). */
export interface Body {
  nodes: Node[];
  braced: boolean;
  /** Line of `{` when braced, else the line of the first body token. */
  openLine: number;
  /** Line of `}` when braced, else the last line of the body. */
  closeLine: number;
}

export interface PackageNode extends NodeBase {
  kind: 'package';
  name: string;
  openLine: number;
  closeLine: number;
  body: Node[];
}

export interface ImportNode extends NodeBase {
  kind: 'import';
  /** Dotted path as written, without the trailing `.*`. */
  path: string;
  wildcard: boolean;
}

export interface MetadataNode extends NodeBase {
  kind: 'metadata';
  name: string;
}

export interface CommentNode extends NodeBase {
  kind: 'comment';
  /** Index of the comment token. */
  tokenIdx: number;
}

export interface ClassNode extends NodeBase {
  kind: 'class';
  modifiers: string[];
  name: string;
  extendsName: string | null;
  extendsRange: TokRange | null;
  implementsNames: string[];
  /** The subset of `implementsNames` that has a source file, so its token exists at run time (design 21.5). */
  implementsTokens: string[];
  body: Body;
}

/**
 * An AS3 interface (design 21.5). `members` holds comments and signature-only method and accessor nodes
 * (their `body` is empty). A member the scanner cannot read makes the whole interface an UnsupportedNode.
 */
export interface InterfaceNode extends NodeBase {
  kind: 'interface';
  modifiers: string[];
  name: string;
  /** Names after `extends`, as written (rewritten to bindings before emit). */
  extendsNames: string[];
  /** The subset of `extendsNames` that has a source file, so its token exists at run time. */
  parentTokens: string[];
  members: Node[];
  body: { openLine: number; closeLine: number };
}

export interface FieldNode extends NodeBase {
  kind: 'field';
  modifiers: string[];
  decl: VarDecl;
}

export interface FunctionLike extends NodeBase {
  modifiers: string[];
  name: string;
  params: Param[];
  returnType: TokRange | null;
  body: Body;
}

export interface MethodNode extends FunctionLike {
  kind: 'method';
  isConstructor: boolean;
}

export interface AccessorNode extends FunctionLike {
  kind: 'accessor';
  accessor: 'get' | 'set';
}

export type StmtKind =
  | 'block' | 'if' | 'for' | 'forIn' | 'while' | 'do'
  | 'return' | 'throw' | 'break' | 'continue' | 'var' | 'expr' | 'empty';

export interface StatementNode extends NodeBase {
  kind: 'statement';
  stmt: StmtKind;
  /** Condition (if/while/do), value (return/throw) or the expression statement. */
  expr: TokRange | null;
  /** `var`/`const` statement, `for` init declaration, or `for-in` variable declaration. */
  decl: VarDecl | null;
  /** `for` init as an expression (when not a declaration). */
  init: TokRange | null;
  step: TokRange | null;
  /** `for-in` variable when not declared with var/const. */
  lhs: TokRange | null;
  /** `for-in` collection expression. */
  iterable: TokRange | null;
  /** `for each`. */
  forEach: boolean;
  body: Body | null;
  elseBody: Body | null;
  /** The else branch is a single unbraced `if`. */
  elseIf: boolean;
  /** Line of the `else` keyword, and of its `{` (or `else` when unbraced). */
  elseLine: number;
  elseOpenLine: number;
  /** Last line of the statement header (up to `{` when the body is braced). */
  headEndLine: number;
}

export interface UnsupportedNode extends NodeBase {
  kind: 'unsupported';
  reason: string;
}

export type Node =
  | PackageNode | ImportNode | MetadataNode | CommentNode | ClassNode | InterfaceNode | FieldNode
  | MethodNode | AccessorNode | StatementNode | UnsupportedNode;

export type NodeKind = Node['kind'];

// ---------------------------------------------------------------------------
// Generic `>>` handling

/**
 * The lexer emits `>>` and `>>>` as single tokens. Inside `.<...>` they close
 * several generics at once. This returns a copy of `tokens` where such tokens
 * are split into single `>` tokens (a leftover such as the `=` of `>>=` stays one
 * token). Start/end offsets are adjusted; line numbers are unchanged.
 */
export function splitAngleTokens(tokens: readonly Token[]): Token[] {
  const out: Token[] = [];
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === 'punct' && t.text === '.<') {
      depth++;
      out.push(t);
      continue;
    }
    if (t.kind === 'punct' && depth > 0 && t.text.charCodeAt(0) === 62) {
      let k = 0;
      while (k < t.text.length && t.text.charCodeAt(k) === 62 && k < depth) k++;
      for (let i = 0; i < k; i++) {
        out.push({ ...t, text: '>', start: t.start + i, end: t.start + i + 1 });
      }
      if (k < t.text.length) {
        out.push({ ...t, text: t.text.slice(k), start: t.start + k });
      }
      depth -= k;
      continue;
    }
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------

class Bail extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const MODIFIERS: ReadonlySet<string> = new Set([
  'public', 'private', 'protected', 'internal', 'static', 'override', 'final', 'dynamic', 'native',
]);

const UNSUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  'try', 'switch', 'with', 'delete', 'namespace', 'use', 'include', 'function',
]);

const OPEN_TO_CLOSE: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };

export interface ScanResult {
  nodes: Node[];
}

/** Scan a whole file. Never throws on AS3 input. */
export function scan(tokens: readonly Token[]): ScanResult {
  return { nodes: new Scanner(tokens).scanFile() };
}

type Level = 'file' | 'package' | 'class' | 'stmt';

class Scanner {
  private readonly sig: number[] = [];
  /** Position in `sig`. */
  private p = 0;
  /** Next full-token index not yet examined for standalone comments. */
  private ci = 0;

  constructor(private readonly tokens: readonly Token[]) {
    for (let i = 0; i < tokens.length; i++) if (tokens[i].kind !== 'comment') this.sig.push(i);
  }

  // -- token helpers -------------------------------------------------------

  private tk(pos: number): Token | undefined {
    const i = this.sig[pos];
    return i === undefined ? undefined : this.tokens[i];
  }

  private peek(k = 0): Token | undefined {
    return this.tk(this.p + k);
  }

  private get atEnd(): boolean {
    return this.p >= this.sig.length;
  }

  private isP(t: Token | undefined, text: string): boolean {
    return t !== undefined && t.kind === 'punct' && t.text === text;
  }

  private isId(t: Token | undefined, text: string): boolean {
    return t !== undefined && t.kind === 'id' && t.text === text;
  }

  private line(pos: number): number {
    return this.tk(pos)?.line ?? this.lastLine();
  }

  private lastLine(): number {
    const t = this.tokens[this.tokens.length - 1];
    return t === undefined ? 1 : t.endLine;
  }

  private rangeOf(a: number, b: number): TokRange | null {
    if (a >= b) return null;
    return { from: this.sig[a], to: this.sig[b - 1] + 1 };
  }

  private mkBase(a: number, b: number): NodeBase {
    const range = this.rangeOf(a, b) ?? { from: this.sig[a], to: this.sig[a] + 1 };
    return {
      range,
      startLine: this.tokens[range.from].line,
      endLine: this.tokens[range.to - 1].endLine,
    };
  }

  /** Skip a bracket group starting at `pos` (an open bracket). Returns the position after it, or -1 at EOF. */
  private skipGroup(pos: number): number {
    const stack: string[] = [];
    let q = pos;
    while (q < this.sig.length) {
      const t = this.tk(q) as Token;
      if (t.kind === 'punct') {
        const close = OPEN_TO_CLOSE[t.text];
        if (close !== undefined) stack.push(close);
        else if (t.text === ')' || t.text === ']' || t.text === '}') {
          const at = stack.lastIndexOf(t.text);
          if (at >= 0) stack.length = at;
          if (stack.length === 0) return q + 1;
        }
      }
      q++;
    }
    return -1;
  }

  /**
   * Scan one simple statement from `this.p` to `;` at depth 0 (consumed) or to a
   * `}` at depth 0 / EOF (not consumed). Returns the sig range without the `;`.
   */
  private simpleEnd(): { a: number; b: number } {
    const a = this.p;
    let q = this.p;
    while (q < this.sig.length) {
      const t = this.tk(q) as Token;
      if (t.kind === 'punct') {
        if (t.text === ';') {
          this.p = q + 1;
          return { a, b: q };
        }
        if (t.text === '}') break;
        if (t.text === '(' || t.text === '[' || t.text === '{') {
          const e = this.skipGroup(q);
          if (e < 0) {
            this.p = this.sig.length;
            throw new Bail('unclosed brace or bracket');
          }
          q = e;
          continue;
        }
      }
      q++;
    }
    this.p = q;
    return { a, b: q };
  }

  /** Reason the own tokens in `[a, b)` cannot be translated, or null. */
  private ownUnsupported(a: number, b: number): string | null {
    for (let q = a; q < b; q++) {
      const t = this.tk(q) as Token;
      if (t.kind === 'bad') return 'unrecognised or unterminated token';
      if (t.kind === 'punct') {
        if (t.text === '..' || t.text === '@' || t.text === '::') return 'E4X or namespace syntax';
        if (t.text === '.' && this.isP(this.tk(q + 1), '(')) return 'E4X filter expression';
      } else if (t.kind === 'id') {
        if (t.text === 'XML' || t.text === 'XMLList') return 'E4X (XML) is not supported';
        if (t.text === 'function') return 'function expressions are not supported';
        if (t.text === 'delete') return 'delete is not supported';
      }
    }
    return null;
  }

  // -- unsupported ---------------------------------------------------------

  /** Unsupported node over the already-consumed sig range `[a, b)`. */
  private unsupportedRange(a: number, b: number, reason: string, toEof = false): UnsupportedNode {
    if (b <= a) b = a + 1;
    const base = this.mkBase(a, b);
    if (toEof) {
      base.range = { from: base.range.from, to: this.tokens.length };
      base.endLine = this.lastLine();
    }
    return { kind: 'unsupported', reason, ...base };
  }

  /**
   * Consume from `startP` per the design rule: balanced groups to a `;` at depth 0
   * or to the end of a depth-0 `{...}` block. `try` continues over catch/finally.
   */
  private unsupportedSkip(startP: number, reason: string): UnsupportedNode {
    this.p = startP;
    const first = this.peek();
    const isTry = this.isId(first, 'try');
    let toEof = false;
    while (this.p < this.sig.length) {
      const t = this.peek() as Token;
      if (this.isP(t, ';')) {
        this.p++;
        break;
      }
      if (this.isP(t, '}')) {
        if (this.p === startP) this.p++; // stray closer: consume it so we make progress
        break;
      }
      if (this.isP(t, '(') || this.isP(t, '[') || this.isP(t, '{')) {
        const e = this.skipGroup(this.p);
        if (e < 0) {
          this.p = this.sig.length;
          toEof = true;
          break;
        }
        const wasBlock = this.isP(t, '{');
        this.p = e;
        if (wasBlock) {
          const nx = this.peek();
          if (isTry && (this.isId(nx, 'catch') || this.isId(nx, 'finally'))) continue;
          break;
        }
        continue;
      }
      this.p++;
    }
    if (reason === 'unclosed brace') toEof = true;
    return this.unsupportedRange(startP, this.p, reason, toEof);
  }

  // -- comments ------------------------------------------------------------

  /** Move standalone comments before the next significant token into `into`. */
  private gatherComments(into: Node[], allowTrail: boolean): void {
    const prevSig = this.p > 0 ? this.sig[this.p - 1] + 1 : 0;
    if (this.ci < prevSig) this.ci = prevSig;
    const stop = this.p < this.sig.length ? this.sig[this.p] : this.tokens.length;
    let last: Node | undefined = allowTrail ? into[into.length - 1] : undefined;
    for (let i = this.ci; i < stop; i++) {
      const t = this.tokens[i];
      if (t.kind !== 'comment') continue;
      if (
        last !== undefined && last.trailing === undefined && t.line === last.endLine &&
        t.endLine === t.line && last.kind !== 'comment'
      ) {
        last.trailing = i;
        continue;
      }
      const node: CommentNode = {
        kind: 'comment',
        tokenIdx: i,
        range: { from: i, to: i + 1 },
        startLine: t.line,
        endLine: t.endLine,
      };
      into.push(node);
      last = undefined;
    }
    this.ci = stop;
  }

  // -- entry ---------------------------------------------------------------

  scanFile(): Node[] {
    const { nodes } = this.items('file');
    return nodes;
  }

  /** Parse items until a `}` (not consumed) or EOF. */
  private items(level: Level): { nodes: Node[]; closed: boolean } {
    const nodes: Node[] = [];
    for (;;) {
      this.gatherComments(nodes, true);
      if (this.atEnd) return { nodes, closed: false };
      const t = this.peek() as Token;
      if (this.isP(t, '}')) {
        if (level !== 'file') return { nodes, closed: true };
        const startP = this.p;
        this.p++;
        nodes.push(this.unsupportedRange(startP, this.p, 'unmatched closing brace'));
        continue;
      }
      const startP = this.p;
      let node: Node;
      try {
        node = this.item(level);
      } catch (e) {
        if (!(e instanceof Bail)) throw e;
        node = this.unsupportedSkip(startP, e.reason);
      }
      if (this.p === startP) this.p++; // never loop without progress
      nodes.push(node);
    }
  }

  private item(level: Level): Node {
    switch (level) {
      case 'file':
      case 'package':
        return this.declItem(level);
      case 'class':
        return this.memberItem();
      default:
        return this.statement();
    }
  }

  // -- file and package level ---------------------------------------------

  private declItem(level: Level): Node {
    const startP = this.p;
    const t = this.peek() as Token;
    if (level === 'file' && this.isId(t, 'package')) return this.packageNode();
    if (this.isId(t, 'import')) return this.importNode();
    if (this.isP(t, '[')) return this.metadataNode();
    const modifiers = this.takeModifiers();
    if (this.isId(this.peek(), 'class')) return this.classNode(startP, modifiers);
    if (this.isId(this.peek(), 'interface') && this.peek(1)?.kind === 'id') return this.interfaceNode(startP, modifiers);
    throw new Bail(this.describe(startP));
  }

  private describe(startP: number): string {
    const t = this.tk(startP);
    const text = t === undefined ? 'end of file' : t.text;
    return `unsupported declaration starting at "${text}"`;
  }

  private takeModifiers(): string[] {
    const mods: string[] = [];
    for (;;) {
      const t = this.peek();
      if (t !== undefined && t.kind === 'id' && MODIFIERS.has(t.text)) {
        const nx = this.peek(1);
        if (nx !== undefined && nx.kind === 'id') {
          mods.push(t.text);
          this.p++;
          continue;
        }
      }
      return mods;
    }
  }

  private packageNode(): Node {
    const startP = this.p;
    this.p++; // package
    let name = '';
    while (!this.atEnd && !this.isP(this.peek(), '{')) {
      name += (this.peek() as Token).text;
      this.p++;
    }
    if (this.atEnd) throw new Bail('unclosed brace');
    const openLine = (this.peek() as Token).line;
    this.p++; // {
    const { nodes, closed } = this.items('package');
    if (!closed) throw new Bail('unclosed brace');
    const closeLine = (this.peek() as Token).line;
    this.p++; // }
    return { kind: 'package', name, openLine, closeLine, body: nodes, ...this.mkBase(startP, this.p) };
  }

  private importNode(): Node {
    const startP = this.p;
    this.p++; // import
    const { a, b } = this.simpleEnd();
    const reason = this.ownUnsupported(a, b);
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    let path = '';
    let wildcard = false;
    for (let q = a; q < b; q++) {
      const t = this.tk(q) as Token;
      if (t.text === '*') wildcard = true;
      else if (t.text === '.' && wildcard) continue;
      else path += t.text;
    }
    if (wildcard && path.endsWith('.')) path = path.slice(0, -1);
    if (path === '') return this.unsupportedRange(startP, this.p, 'empty import');
    return { kind: 'import', path, wildcard, ...this.mkBase(startP, this.p) };
  }

  private metadataNode(): Node {
    const startP = this.p;
    const e = this.skipGroup(this.p);
    if (e < 0) throw new Bail('unclosed brace or bracket');
    const nameTok = this.tk(this.p + 1);
    this.p = e;
    return { kind: 'metadata', name: nameTok?.text ?? '', ...this.mkBase(startP, this.p) };
  }

  private classNode(startP: number, modifiers: string[]): Node {
    this.p++; // class
    const nameTok = this.peek();
    if (nameTok === undefined || nameTok.kind !== 'id') throw new Bail('class without a name');
    this.p++;
    let extendsName: string | null = null;
    let extendsRange: TokRange | null = null;
    const implementsNames: string[] = [];
    if (this.isId(this.peek(), 'extends')) {
      this.p++;
      const a = this.p;
      const e = this.typeEnd(a);
      if (e < 0) throw new Bail('class extends something that is not a type name');
      extendsName = this.joinText(a, e);
      extendsRange = this.rangeOf(a, e);
      this.p = e;
    }
    if (this.isId(this.peek(), 'implements')) {
      this.p++;
      for (;;) {
        const a = this.p;
        const e = this.typeEnd(a);
        if (e < 0) throw new Bail('bad implements list');
        implementsNames.push(this.joinText(a, e));
        this.p = e;
        if (this.isP(this.peek(), ',')) {
          this.p++;
          continue;
        }
        break;
      }
    }
    if (!this.isP(this.peek(), '{')) throw new Bail('class header not followed by "{"');
    const openLine = (this.peek() as Token).line;
    this.p++;
    const { nodes, closed } = this.items('class');
    if (!closed) throw new Bail('unclosed brace');
    // Constructors: a method named like the class.
    for (const n of nodes) if (n.kind === 'method' && n.name === nameTok.text) n.isConstructor = true;
    const closeLine = (this.peek() as Token).line;
    this.p++; // }
    return {
      kind: 'class',
      modifiers,
      name: nameTok.text,
      extendsName,
      extendsRange,
      implementsNames,
      implementsTokens: [],
      body: { nodes, braced: true, openLine, closeLine },
      ...this.mkBase(startP, this.p),
    };
  }

  private interfaceNode(startP: number, modifiers: string[]): Node {
    this.p++; // interface
    const nameTok = this.peek() as Token;
    this.p++;
    const extendsNames: string[] = [];
    if (this.isId(this.peek(), 'extends')) {
      this.p++;
      for (;;) {
        const a = this.p;
        const e = this.typeEnd(a);
        if (e < 0) throw new Bail('bad interface extends list');
        extendsNames.push(this.joinText(a, e));
        this.p = e;
        if (!this.isP(this.peek(), ',')) break;
        this.p++;
      }
    }
    if (!this.isP(this.peek(), '{')) throw new Bail('interface header not followed by "{"');
    const openLine = (this.peek() as Token).line;
    this.p++;
    const members: Node[] = [];
    for (;;) {
      this.gatherComments(members, true);
      if (this.atEnd) throw new Bail('unclosed brace');
      if (this.isP(this.peek(), '}')) break;
      members.push(this.interfaceMember());
    }
    const closeLine = (this.peek() as Token).line;
    this.p++; // }
    return {
      kind: 'interface',
      modifiers,
      name: nameTok.text,
      extendsNames,
      parentTokens: [],
      members,
      body: { openLine, closeLine },
      ...this.mkBase(startP, this.p),
    };
  }

  /** `function [get|set] name(params) : Type;` A Bail here makes the whole interface unsupported. */
  private interfaceMember(): Node {
    const startP = this.p;
    if (!this.isId(this.peek(), 'function')) throw new Bail(this.describe(startP));
    const head = this.functionHead();
    if (this.isP(this.peek(), ';')) this.p++;
    else if (!this.isP(this.peek(), '}')) throw new Bail('interface member with a body');
    const base = this.mkBase(startP, this.p);
    const body: Body = { nodes: [], braced: false, openLine: base.startLine, closeLine: base.endLine };
    if (head.accessor !== null) {
      return { kind: 'accessor', accessor: head.accessor, modifiers: [], name: head.name, params: head.params, returnType: head.returnType, body, ...base };
    }
    return { kind: 'method', isConstructor: false, modifiers: [], name: head.name, params: head.params, returnType: head.returnType, body, ...base };
  }

  private joinText(a: number, b: number): string {
    let s = '';
    for (let q = a; q < b; q++) s += (this.tk(q) as Token).text;
    return s;
  }

  // -- types ---------------------------------------------------------------

  /**
   * End (exclusive, in sig positions) of the type starting at `a`, or -1.
   * Accepts `*`, dotted names and `.<...>` generics, closing `>>`/`>>>` per level.
   * A type that would end inside a token (`>>=`) is rejected.
   */
  private typeEnd(a: number): number {
    const st = { pending: 0 };
    const e = this.typeAt(a, st);
    return e >= 0 && st.pending === 0 ? e : -1;
  }

  private typeAt(a: number, st: { pending: number }): number {
    let q = a;
    const t = this.tk(q);
    if (t === undefined) return -1;
    if (this.isP(t, '*')) return q + 1;
    if (t.kind !== 'id') return -1;
    q++;
    while (this.isP(this.tk(q), '.') && this.tk(q + 1)?.kind === 'id') q += 2;
    if (this.isP(this.tk(q), '.<')) {
      q++;
      for (;;) {
        q = this.typeAt(q, st);
        if (q < 0) return -1;
        if (st.pending > 0) {
          st.pending--;
          return q;
        }
        const n = this.tk(q);
        if (this.isP(n, ',')) {
          q++;
          continue;
        }
        if (n !== undefined && n.kind === 'punct' && n.text.length > 0 && allGreater(n.text)) {
          st.pending = n.text.length - 1;
          return q + 1;
        }
        return -1;
      }
    }
    return q;
  }

  // -- class members -------------------------------------------------------

  private memberItem(): Node {
    const startP = this.p;
    const t = this.peek() as Token;
    if (this.isP(t, '[')) return this.metadataNode();
    const modifiers = this.takeModifiers();
    const k = this.peek();
    if (this.isId(k, 'var') || this.isId(k, 'const')) return this.fieldNode(startP, modifiers);
    if (this.isId(k, 'function')) return this.functionNode(startP, modifiers);
    throw new Bail(this.describe(startP));
  }

  private fieldNode(startP: number, modifiers: string[]): Node {
    const isConst = (this.peek() as Token).text === 'const';
    this.p++;
    const { a, b } = this.simpleEnd();
    const reason = this.ownUnsupported(a, b);
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    const decl = this.declarators(a, b, isConst);
    return { kind: 'field', modifiers, decl, ...this.mkBase(startP, this.p) };
  }

  /** Parse `name[:type][=init], ...` in sig range `[a, b)`. */
  private declarators(a: number, b: number, isConst: boolean): VarDecl {
    const out: Declarator[] = [];
    let s = a;
    while (s <= b) {
      const e = this.commaEnd(s, b);
      if (e <= s) throw new Bail('empty declarator');
      out.push(this.declarator(s, e));
      s = e + 1;
      if (e === b) break;
    }
    return { isConst, declarators: out };
  }

  /** Position of the next depth-0 `,` in `[s, b)`, or `b`. */
  private commaEnd(s: number, b: number): number {
    let q = s;
    while (q < b) {
      const t = this.tk(q) as Token;
      if (this.isP(t, ',')) return q;
      if (this.isP(t, '(') || this.isP(t, '[') || this.isP(t, '{')) {
        const e = this.skipGroup(q);
        if (e < 0 || e > b) throw new Bail('unclosed brace or bracket');
        q = e;
        continue;
      }
      q++;
    }
    return b;
  }

  private declarator(s: number, e: number): Declarator {
    const nameTok = this.tk(s) as Token;
    if (nameTok.kind !== 'id') throw new Bail('expected a variable name');
    let q = s + 1;
    let type: TokRange | null = null;
    if (q < e && this.isP(this.tk(q), ':')) {
      const te = this.typeEnd(q + 1);
      if (te < 0 || te > e) throw new Bail('unsupported type annotation');
      type = this.rangeOf(q + 1, te);
      q = te;
    }
    let init: TokRange | null = null;
    if (q < e) {
      if (!this.isP(this.tk(q), '=')) throw new Bail('unexpected tokens in declaration');
      init = this.rangeOf(q + 1, e);
      if (init === null) throw new Bail('missing initialiser');
    }
    return { name: nameTok.text, nameIdx: this.sig[s], line: nameTok.line, type, init };
  }

  private functionNode(startP: number, modifiers: string[]): Node {
    const { accessor, name, params, returnType } = this.functionHead();
    if (!this.isP(this.peek(), '{')) throw new Bail('function without a body');
    const body = this.block();
    const base = this.mkBase(startP, this.p);
    if (accessor !== null) {
      return { kind: 'accessor', accessor, modifiers, name, params, returnType, body, ...base };
    }
    return {
      kind: 'method', isConstructor: false, modifiers, name, params, returnType, body, ...base,
    };
  }

  /** From `function` to the end of the return type. */
  private functionHead(): { accessor: 'get' | 'set' | null; name: string; params: Param[]; returnType: TokRange | null } {
    this.p++; // function
    let accessor: 'get' | 'set' | null = null;
    const first = this.peek();
    if (
      first !== undefined && first.kind === 'id' && (first.text === 'get' || first.text === 'set') &&
      this.peek(1)?.kind === 'id'
    ) {
      accessor = first.text;
      this.p++;
    }
    const nameTok = this.peek();
    if (nameTok === undefined || nameTok.kind !== 'id') throw new Bail('function without a name');
    this.p++;
    if (!this.isP(this.peek(), '(')) throw new Bail('function without a parameter list');
    const open = this.p;
    const close = this.skipGroup(open);
    if (close < 0) throw new Bail('unclosed brace or bracket');
    const params = this.params(open + 1, close - 1);
    this.p = close;
    let returnType: TokRange | null = null;
    if (this.isP(this.peek(), ':')) {
      const te = this.typeEnd(this.p + 1);
      if (te < 0) throw new Bail('unsupported return type');
      returnType = this.rangeOf(this.p + 1, te);
      this.p = te;
    }
    return { accessor, name: nameTok.text, params, returnType };
  }

  private params(a: number, b: number): Param[] {
    const out: Param[] = [];
    if (a >= b) return out;
    let s = a;
    for (;;) {
      const e = this.commaEnd(s, b);
      if (e <= s) throw new Bail('empty parameter');
      out.push(this.param(s, e));
      if (e >= b) break;
      s = e + 1;
    }
    return out;
  }

  private param(s: number, e: number): Param {
    let q = s;
    let rest = false;
    if (this.isP(this.tk(q), '...')) {
      rest = true;
      q++;
    }
    const nameTok = this.tk(q);
    if (nameTok === undefined || nameTok.kind !== 'id') throw new Bail('expected a parameter name');
    q++;
    let type: TokRange | null = null;
    if (q < e && this.isP(this.tk(q), ':')) {
      const te = this.typeEnd(q + 1);
      if (te < 0 || te > e) throw new Bail('unsupported type annotation');
      type = this.rangeOf(q + 1, te);
      q = te;
    }
    let init: TokRange | null = null;
    if (q < e) {
      if (!this.isP(this.tk(q), '=')) throw new Bail('unexpected tokens in parameter');
      init = this.rangeOf(q + 1, e);
    }
    return { name: nameTok.text, rest, line: nameTok.line, type, init };
  }

  // -- statements ----------------------------------------------------------

  /** Parse `{ ... }` at `this.p` into a braced Body. */
  private block(): Body {
    const open = this.peek() as Token;
    this.p++;
    const { nodes, closed } = this.items('stmt');
    if (!closed) throw new Bail('unclosed brace');
    const close = this.peek() as Token;
    this.p++;
    return { nodes, braced: true, openLine: open.line, closeLine: close.endLine };
  }

  private body(): Body {
    if (this.isP(this.peek(), '{')) return this.block();
    const node = this.statementGuarded();
    const first = this.tokens[node.range.from];
    return {
      nodes: [node], braced: false, openLine: first.line,
      closeLine: this.tokens[node.range.to - 1].endLine,
    };
  }

  private statementGuarded(): Node {
    const startP = this.p;
    try {
      return this.statement();
    } catch (e) {
      if (!(e instanceof Bail)) throw e;
      return this.unsupportedSkip(startP, e.reason);
    }
  }

  private emptyStmt(base: NodeBase, stmt: StmtKind): StatementNode {
    return {
      kind: 'statement', stmt, expr: null, decl: null, init: null, step: null, lhs: null,
      iterable: null, forEach: false, body: null, elseBody: null, elseIf: false,
      elseLine: 0, elseOpenLine: 0, headEndLine: base.startLine, ...base,
    };
  }

  private statement(): Node {
    const startP = this.p;
    const t = this.peek() as Token;
    if (t.kind === 'id') {
      if (UNSUPPORTED_KEYWORDS.has(t.text)) return this.unsupportedSkip(startP, `"${t.text}" is not supported`);
      if (t.text === 'default' && this.isId(this.peek(1), 'xml')) {
        return this.unsupportedSkip(startP, '"default xml namespace" is not supported');
      }
      if (this.isP(this.peek(1), ':')) {
        return this.unsupportedSkip(startP, 'labels are not supported');
      }
      switch (t.text) {
        case 'if': return this.ifStmt();
        case 'while': return this.whileStmt();
        case 'do': return this.doStmt();
        case 'for': return this.forStmt();
        case 'return':
        case 'throw':
          return this.valueStmt(t.text);
        case 'break':
        case 'continue':
          return this.jumpStmt(t.text);
        case 'var':
        case 'const':
          return this.varStmt();
        default:
          break;
      }
    }
    if (this.isP(t, '{')) {
      const body = this.block();
      const n = this.emptyStmt(this.mkBase(startP, this.p), 'block');
      n.body = body;
      n.headEndLine = body.openLine;
      return n;
    }
    if (this.isP(t, ';')) {
      this.p++;
      return this.emptyStmt(this.mkBase(startP, this.p), 'empty');
    }
    const { a, b } = this.simpleEnd();
    const reason = this.ownUnsupported(a, b);
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    const n = this.emptyStmt(this.mkBase(startP, this.p), 'expr');
    n.expr = this.rangeOf(a, b);
    return n;
  }

  private varStmt(): Node {
    const startP = this.p;
    const isConst = (this.peek() as Token).text === 'const';
    this.p++;
    const { a, b } = this.simpleEnd();
    const reason = this.ownUnsupported(a, b);
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    const n = this.emptyStmt(this.mkBase(startP, this.p), 'var');
    n.decl = this.declarators(a, b, isConst);
    return n;
  }

  private valueStmt(word: string): Node {
    const startP = this.p;
    this.p++;
    const { a, b } = this.simpleEnd();
    const reason = this.ownUnsupported(a, b);
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    const n = this.emptyStmt(this.mkBase(startP, this.p), word === 'return' ? 'return' : 'throw');
    n.expr = this.rangeOf(a, b);
    return n;
  }

  private jumpStmt(word: string): Node {
    const startP = this.p;
    this.p++;
    const { a, b } = this.simpleEnd();
    if (b > a) return this.unsupportedRange(startP, this.p, 'labels are not supported');
    return this.emptyStmt(this.mkBase(startP, this.p), word === 'break' ? 'break' : 'continue');
  }

  /** Parse `( ... )` at `this.p`; returns the inner sig range and the line of `)`. */
  private parenHeader(): { a: number; b: number; endLine: number } {
    if (!this.isP(this.peek(), '(')) throw new Bail('expected "("');
    const open = this.p;
    const close = this.skipGroup(open);
    if (close < 0) throw new Bail('unclosed brace or bracket');
    this.p = close;
    return { a: open + 1, b: close - 1, endLine: this.line(close - 1) };
  }

  private ifStmt(): Node {
    const startP = this.p;
    this.p++;
    const h = this.parenHeader();
    const reason = this.ownUnsupported(h.a, h.b);
    const cond = this.rangeOf(h.a, h.b);
    if (cond === null) throw new Bail('empty condition');
    const body = this.body();
    let elseBody: Body | null = null;
    let elseIf = false;
    let elseLine = 0;
    let elseOpenLine = 0;
    if (this.isId(this.peek(), 'else')) {
      this.gatherComments(body.nodes, false);
      elseLine = (this.peek() as Token).line;
      this.p++;
      elseIf = this.isId(this.peek(), 'if');
      elseBody = this.body();
      elseOpenLine = elseBody.braced ? elseBody.openLine : elseLine;
      if (elseIf && elseBody.nodes[0].kind !== 'statement') elseIf = false;
      if (elseBody.nodes.length !== 1) elseIf = false;
    }
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    const n = this.emptyStmt(this.mkBase(startP, this.p), 'if');
    n.expr = cond;
    n.body = body;
    n.elseBody = elseBody;
    n.elseIf = elseIf;
    n.elseLine = elseLine;
    n.elseOpenLine = elseOpenLine;
    n.headEndLine = body.braced ? body.openLine : h.endLine;
    return n;
  }

  private whileStmt(): Node {
    const startP = this.p;
    this.p++;
    const h = this.parenHeader();
    const reason = this.ownUnsupported(h.a, h.b);
    const cond = this.rangeOf(h.a, h.b);
    if (cond === null) throw new Bail('empty condition');
    const body = this.body();
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    const n = this.emptyStmt(this.mkBase(startP, this.p), 'while');
    n.expr = cond;
    n.body = body;
    n.headEndLine = body.braced ? body.openLine : h.endLine;
    return n;
  }

  private doStmt(): Node {
    const startP = this.p;
    this.p++;
    const startLine = this.line(startP);
    const body = this.body();
    this.gatherComments(body.nodes, false);
    if (!this.isId(this.peek(), 'while')) throw new Bail('do without while');
    this.p++;
    const h = this.parenHeader();
    if (this.isP(this.peek(), ';')) this.p++;
    const reason = this.ownUnsupported(h.a, h.b);
    const cond = this.rangeOf(h.a, h.b);
    if (cond === null) throw new Bail('empty condition');
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    const n = this.emptyStmt(this.mkBase(startP, this.p), 'do');
    n.expr = cond;
    n.body = body;
    n.headEndLine = body.braced ? body.openLine : startLine;
    n.elseLine = h.endLine; // line of the trailing `while (...)`
    return n;
  }

  private forStmt(): Node {
    const startP = this.p;
    this.p++;
    let forEach = false;
    if (this.isId(this.peek(), 'each')) {
      forEach = true;
      this.p++;
    }
    const h = this.parenHeader();
    const reason = this.ownUnsupported(h.a, h.b);
    // Locate a depth-0 `in` and depth-0 `;` separators.
    let inPos = -1;
    const semis: number[] = [];
    for (let q = h.a; q < h.b; q++) {
      const t = this.tk(q) as Token;
      if (this.isP(t, '(') || this.isP(t, '[') || this.isP(t, '{')) {
        const e = this.skipGroup(q);
        if (e < 0 || e > h.b) throw new Bail('unclosed brace or bracket');
        q = e - 1;
      } else if (this.isP(t, ';')) semis.push(q);
      else if (this.isId(t, 'in') && inPos < 0) inPos = q;
    }
    const n = this.emptyStmt(this.mkBase(startP, startP + 1), 'for');
    n.forEach = forEach;
    if (inPos >= 0 && semis.length === 0) {
      n.stmt = 'forIn';
      const first = this.tk(h.a);
      if (this.isId(first, 'var') || this.isId(first, 'const')) {
        n.decl = this.declarators(h.a + 1, inPos, (first as Token).text === 'const');
        if (n.decl.declarators.length !== 1) throw new Bail('for-in with several variables');
      } else {
        n.lhs = this.rangeOf(h.a, inPos);
        if (n.lhs === null) throw new Bail('for-in without a variable');
      }
      n.iterable = this.rangeOf(inPos + 1, h.b);
      if (n.iterable === null) throw new Bail('for-in without a collection');
    } else {
      if (forEach || semis.length !== 2) throw new Bail('unsupported for header');
      const first = this.tk(h.a);
      if (this.isId(first, 'var') || this.isId(first, 'const')) {
        n.decl = this.declarators(h.a + 1, semis[0], (first as Token).text === 'const');
      } else {
        n.init = this.rangeOf(h.a, semis[0]);
      }
      n.expr = this.rangeOf(semis[0] + 1, semis[1]);
      n.step = this.rangeOf(semis[1] + 1, h.b);
    }
    const body = this.body();
    if (reason !== null) return this.unsupportedRange(startP, this.p, reason);
    Object.assign(n, this.mkBase(startP, this.p));
    n.body = body;
    n.headEndLine = body.braced ? body.openLine : h.endLine;
    return n;
  }
}

function allGreater(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) !== 62) return false;
  return true;
}
