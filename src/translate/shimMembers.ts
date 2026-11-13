/**
 * Shim_Member_Table extraction (Requirement 22.5, design 18.2 and 18.6). Core: no node modules, no
 * regular expressions, no typescript-js. A small hand-written scanner reads the declaration text of
 * `template/shim/*.ts` and lists the instance members of the classes that `index.ts` re-exports and
 * of the classes their `extends` chains reach.
 */

export interface ShimSource {
  /** Posix path inside template/shim/, e.g. 'DisplayObject.ts'. */
  path: string;
  text: string;
}
export type ShimMemberKind = 'method' | 'property';
export interface ShimClassMembers {
  extends: string | null;
  members: ReadonlyArray<{ name: string; kind: ShimMemberKind }>;
}
/** Key: class name. Keys and members are sorted by code unit. */
export type ShimMemberTable = Readonly<Record<string, ShimClassMembers>>;

/** Message shape: `<path>:<line>: <problem>`. */
export class ShimDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShimDeclarationError';
  }
}

// ---------------------------------------------------------------------------------------------
// Tokens

type TokKind = 'id' | 'str' | 'num' | 'p';
interface Tok {
  k: TokKind;
  t: string;
  line: number;
}

function isIdStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$' || c === '#' || c > '\u007f';
}
function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}
function isIdPart(c: string): boolean {
  return isIdStart(c) || isDigit(c);
}

class Fail {
  constructor(private readonly path: string) {}
  at(line: number, problem: string): ShimDeclarationError {
    return new ShimDeclarationError(`${this.path}:${line}: ${problem}`);
  }
}

/** Skips a quoted string starting at `i` (the quote); returns the index after it. */
function skipQuoted(text: string, i: number, line: number, fail: Fail): number {
  const q = text[i]!;
  let j = i + 1;
  while (j < text.length) {
    const c = text[j]!;
    if (c === '\\') j += 2;
    else if (c === q) return j + 1;
    else if (c === '\n') throw fail.at(line, 'unterminated string');
    else j++;
  }
  throw fail.at(line, 'unterminated string');
}

/** Skips a template literal starting at `i` (the backtick), `${}` nesting included. */
function skipTemplate(text: string, i: number, line: number, fail: Fail): number {
  let j = i + 1;
  while (j < text.length) {
    const c = text[j]!;
    if (c === '\\') j += 2;
    else if (c === '`') return j + 1;
    else if (c === '$' && text[j + 1] === '{') j = skipBraces(text, j + 1, line, fail);
    else j++;
  }
  throw fail.at(line, 'unterminated template literal');
}

/** `i` is a `{`; returns the index after the matching `}`, skipping strings, templates and comments. */
function skipBraces(text: string, i: number, line: number, fail: Fail): number {
  let depth = 0;
  let j = i;
  while (j < text.length) {
    const c = text[j]!;
    if (c === '{') {
      depth++;
      j++;
    } else if (c === '}') {
      depth--;
      j++;
      if (depth === 0) return j;
    } else if (c === '"' || c === "'") j = skipQuoted(text, j, line, fail);
    else if (c === '`') j = skipTemplate(text, j, line, fail);
    else if (c === '/' && text[j + 1] === '/') {
      while (j < text.length && text[j] !== '\n') j++;
    } else if (c === '/' && text[j + 1] === '*') {
      const end = text.indexOf('*/', j + 2);
      if (end < 0) throw fail.at(line, 'unterminated comment');
      j = end + 2;
    } else j++;
  }
  throw fail.at(line, 'unbalanced braces in template literal');
}

function countLines(text: string, from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) if (text[i] === '\n') n++;
  return n;
}

function tokenize(text: string, fail: Fail): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '\n') {
      line++;
      i++;
    } else if (c === ' ' || c === '\t' || c === '\r' || c === '\u00a0' || c === '\ufeff') i++;
    else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw fail.at(line, 'unterminated comment');
      line += countLines(text, i, end);
      i = end + 2;
    } else if (c === '"' || c === "'") {
      const end = skipQuoted(text, i, line, fail);
      out.push({ k: 'str', t: text.slice(i + 1, end - 1), line });
      i = end;
    } else if (c === '`') {
      const end = skipTemplate(text, i, line, fail);
      out.push({ k: 'str', t: text.slice(i + 1, end - 1), line });
      line += countLines(text, i, end);
      i = end;
    } else if (isDigit(c)) {
      let j = i + 1;
      while (j < text.length && (isIdPart(text[j]!) || text[j] === '.')) j++;
      out.push({ k: 'num', t: text.slice(i, j), line });
      i = j;
    } else if (isIdStart(c)) {
      let j = i + 1;
      while (j < text.length && isIdPart(text[j]!)) j++;
      out.push({ k: 'id', t: text.slice(i, j), line });
      i = j;
    } else if (c === '=' && text[i + 1] === '>') {
      out.push({ k: 'p', t: '=>', line });
      i += 2;
    } else {
      out.push({ k: 'p', t: c, line });
      i++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Declaration scanner

const MEMBER_MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'readonly', 'override', 'abstract', 'declare', 'async']);
const PARAM_MODIFIERS = new Set(['public', 'private', 'protected', 'readonly', 'override']);
/** After a modifier-like word, these tokens mean the word is itself the member name. */
const NAME_FOLLOWERS = new Set(['(', '<', ':', '=', ';', '?', '!', '}']);
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const TYPE_CONTEXT_PREV = new Set([':', '|', '&', ',', '=>', '<', '(', '[']);
const CONTINUES_AFTER = new Set(['=', ':', ',', '|', '&', '?', '+', '-', '*', '/', '%', '<', '.', '=>']);
const CONTINUES_BEFORE = new Set(['|', '&', '.', '?', ',', '=', ':', '+', '*', '/', '%', '<', '=>']);

interface RawClass {
  name: string;
  path: string;
  line: number;
  extendsName: string | null;
  members: Array<{ name: string; kind: ShimMemberKind }>;
}

class Scanner {
  constructor(
    private readonly toks: readonly Tok[],
    private readonly fail: Fail,
  ) {}

  private lastLine(): number {
    return this.toks.length === 0 ? 1 : this.toks[this.toks.length - 1]!.line;
  }

  private tokAt(i: number): Tok | undefined {
    return this.toks[i];
  }

  private isP(i: number, t: string): boolean {
    const x = this.toks[i];
    return x !== undefined && x.k === 'p' && x.t === t;
  }

  /** `i` is an opening bracket; returns the index after its match. */
  private skipBalanced(i: number): number {
    const stack: string[] = [];
    for (let j = i; j < this.toks.length; j++) {
      const t = this.toks[j]!;
      if (t.k !== 'p') continue;
      if (OPENERS.has(t.t)) stack.push(t.t);
      else if (CLOSERS.has(t.t)) {
        const open = stack.pop();
        const want = t.t === ')' ? '(' : t.t === ']' ? '[' : '{';
        if (open !== want) throw this.fail.at(t.line, `unbalanced "${t.t}"`);
        if (stack.length === 0) return j + 1;
      }
    }
    throw this.fail.at(this.toks[i]!.line, 'unbalanced bracket');
  }

  /** `i` is a `<`; returns the index after the matching `>`. */
  private skipAngles(i: number): number {
    let depth = 0;
    for (let j = i; j < this.toks.length; j++) {
      const t = this.toks[j]!;
      if (t.k !== 'p') continue;
      if (t.t === '<') depth++;
      else if (t.t === '>') {
        depth--;
        if (depth === 0) return j + 1;
      } else if (OPENERS.has(t.t)) j = this.skipBalanced(j) - 1;
    }
    throw this.fail.at(this.toks[i]!.line, 'unbalanced "<"');
  }

  /** After the parameter list: return type, then a body or a `;`. Returns the index after it. */
  private skipSignatureTail(start: number): number {
    let angle = 0;
    for (let j = start; j < this.toks.length; j++) {
      const t = this.toks[j]!;
      if (t.k !== 'p') continue;
      if (t.t === ';' && angle === 0) return j + 1;
      if (t.t === '}' && angle === 0) return j;
      if (t.t === '<') angle++;
      else if (t.t === '>') angle = angle > 0 ? angle - 1 : 0;
      else if (t.t === '{') {
        const prev = this.toks[j - 1];
        const inType = angle > 0 || (prev !== undefined && prev.k === 'p' && TYPE_CONTEXT_PREV.has(prev.t));
        const after = this.skipBalanced(j);
        if (!inType) return after;
        j = after - 1;
      } else if (t.t === '(' || t.t === '[') j = this.skipBalanced(j) - 1;
    }
    throw this.fail.at(this.toks[start]?.line ?? this.lastLine(), 'method without a body or ";"');
  }

  /** After a property name: initializer and type up to `;` (consumed) or the end of the statement. */
  private skipPropertyEnd(start: number): number {
    for (let j = start; j < this.toks.length; j++) {
      const t = this.toks[j]!;
      const prev = this.toks[j - 1];
      if (j > start && prev !== undefined && t.line > prev.line) {
        const prevContinues = prev.k === 'p' && CONTINUES_AFTER.has(prev.t);
        const nextContinues = t.k === 'p' && CONTINUES_BEFORE.has(t.t);
        if (!prevContinues && !nextContinues) return j;
      }
      if (t.k !== 'p') continue;
      if (t.t === ';') return j + 1;
      if (t.t === '}') return j;
      if (OPENERS.has(t.t)) j = this.skipBalanced(j) - 1;
    }
    throw this.fail.at(this.lastLine(), 'unterminated class body');
  }

  /** `open` is the `(` of a constructor; adds parameter properties and returns the index after `)`. */
  private constructorParams(open: number, members: Array<{ name: string; kind: ShimMemberKind }>): number {
    let j = open + 1;
    let atStart = true;
    let angle = 0;
    while (j < this.toks.length) {
      const t = this.toks[j]!;
      if (atStart) {
        atStart = false;
        if (t.k === 'p' && t.t === ')') return j + 1;
        const mods: string[] = [];
        while (j < this.toks.length) {
          const m = this.toks[j]!;
          const n = this.toks[j + 1];
          if (m.k === 'id' && PARAM_MODIFIERS.has(m.t) && n !== undefined && (n.k === 'id' || (n.k === 'p' && (n.t === '{' || n.t === '[')))) {
            mods.push(m.t);
            j++;
          } else break;
        }
        const nameTok = this.toks[j];
        if (mods.length > 0) {
          if (nameTok === undefined || nameTok.k !== 'id') {
            throw this.fail.at(nameTok?.line ?? t.line, 'constructor parameter property without a plain name');
          }
          if (!mods.includes('private') && !nameTok.t.startsWith('_') && !nameTok.t.startsWith('#')) {
            members.push({ name: nameTok.t, kind: 'property' });
          }
        }
        continue;
      }
      if (t.k === 'p') {
        if (t.t === ')' && angle === 0) return j + 1;
        if (OPENERS.has(t.t)) {
          j = this.skipBalanced(j);
          continue;
        }
        if (t.t === '<') angle++;
        else if (t.t === '>') angle = angle > 0 ? angle - 1 : 0;
        else if (t.t === ',' && angle === 0) atStart = true;
      }
      j++;
    }
    throw this.fail.at(this.toks[open]!.line, 'unbalanced constructor parameters');
  }

  /** `i` is just after the class `{`; returns the index after the closing `}`. */
  private classBody(start: number, cls: RawClass): number {
    let i = start;
    for (;;) {
      const t = this.tokAt(i);
      if (t === undefined) throw this.fail.at(this.lastLine(), `class ${cls.name}: unbalanced braces`);
      if (t.k === 'p' && t.t === '}') return i + 1;
      if (t.k === 'p' && t.t === ';') {
        i++;
        continue;
      }
      i = this.member(i, cls);
    }
  }

  private member(start: number, cls: RawClass): number {
    let i = start;
    const first = this.toks[i]!;
    if (first.k === 'p' && first.t === '@') throw this.fail.at(first.line, 'decorators are not understood');
    const mods = new Set<string>();
    for (;;) {
      const t = this.toks[i];
      const n = this.toks[i + 1];
      if (t === undefined || t.k !== 'id' || !MEMBER_MODIFIERS.has(t.t) || n === undefined) break;
      if (n.k === 'p' && NAME_FOLLOWERS.has(n.t)) break;
      mods.add(t.t);
      i++;
    }
    if (mods.has('static') && this.isP(i, '{')) throw this.fail.at(this.toks[i]!.line, 'static blocks are not understood');
    let accessor = false;
    {
      const t = this.toks[i];
      const n = this.toks[i + 1];
      if (t !== undefined && t.k === 'id' && (t.t === 'get' || t.t === 'set') && n !== undefined && !(n.k === 'p' && NAME_FOLLOWERS.has(n.t))) {
        accessor = true;
        i++;
      }
    }
    if (this.isP(i, '*')) i++;
    const nameTok = this.toks[i];
    if (nameTok === undefined) throw this.fail.at(this.lastLine(), `class ${cls.name}: unbalanced braces`);
    if (nameTok.k === 'p') {
      throw this.fail.at(nameTok.line, nameTok.t === '[' ? 'computed member names are not understood' : `unexpected "${nameTok.t}" in class body`);
    }
    const name = nameTok.t;
    i++;
    if (this.isP(i, '?') || this.isP(i, '!')) i++;
    const next = this.toks[i];
    const listed = !mods.has('private') && !mods.has('static') && !name.startsWith('_') && !name.startsWith('#');
    if (next !== undefined && next.k === 'p' && (next.t === '(' || next.t === '<')) {
      let open = i;
      if (next.t === '<') open = this.skipAngles(i);
      if (!this.isP(open, '(')) throw this.fail.at(nameTok.line, `unclassifiable member "${name}"`);
      if (name === 'constructor' && nameTok.k === 'id' && !mods.has('static') && !accessor) {
        const after = this.constructorParams(open, cls.members);
        return this.skipSignatureTail(after);
      }
      const after = this.skipBalanced(open);
      if (listed) cls.members.push({ name, kind: accessor ? 'property' : 'method' });
      return this.skipSignatureTail(after);
    }
    const endsMember =
      next === undefined ||
      (next.k === 'p' && (next.t === ':' || next.t === '=' || next.t === ';' || next.t === '}')) ||
      next.line > nameTok.line;
    if (!endsMember || accessor) throw this.fail.at(nameTok.line, `unclassifiable member "${name}"`);
    if (listed) cls.members.push({ name, kind: 'property' });
    return this.skipPropertyEnd(i);
  }

  /** Reads the classes declared at the top level and the names of `export { ... }` clauses. */
  scan(path: string): { classes: RawClass[]; exported: string[] } {
    const classes: RawClass[] = [];
    const exported: string[] = [];
    let depth = 0;
    let i = 0;
    while (i < this.toks.length) {
      const t = this.toks[i]!;
      if (t.k === 'p') {
        if (t.t === '{') depth++;
        else if (t.t === '}') depth--;
        i++;
        continue;
      }
      if (depth === 0 && t.k === 'id' && t.t === 'export' && this.isP(i + 1, '{')) {
        i = this.exportClause(i + 2, exported);
        continue;
      }
      const nameTok = this.toks[i + 1];
      if (depth === 0 && t.k === 'id' && t.t === 'class' && nameTok !== undefined && nameTok.k === 'id' && nameTok.t !== 'extends') {
        const cls: RawClass = { name: nameTok.t, path, line: t.line, extendsName: null, members: [] };
        i = this.classHead(i + 2, cls);
        i = this.classBody(i, cls);
        classes.push(cls);
        continue;
      }
      i++;
    }
    return { classes, exported };
  }

  private exportClause(start: number, out: string[]): number {
    let i = start;
    let itemStart = true;
    while (i < this.toks.length) {
      const t = this.toks[i]!;
      if (t.k === 'p' && t.t === '}') return i + 1;
      if (t.k === 'p' && t.t === ',') itemStart = true;
      else if (itemStart && t.k === 'id') {
        const n = this.toks[i + 1];
        const inlineType = t.t === 'type' && n !== undefined && n.k === 'id' && n.t !== 'as';
        if (!inlineType) out.push(t.t);
        itemStart = false;
      }
      i++;
    }
    throw this.fail.at(this.lastLine(), 'unterminated export clause');
  }

  /** After the class name: generics, `extends`, `implements`, up to and including the `{`. */
  private classHead(start: number, cls: RawClass): number {
    let i = start;
    if (this.isP(i, '<')) i = this.skipAngles(i);
    const t = this.toks[i];
    if (t !== undefined && t.k === 'id' && t.t === 'extends') {
      i++;
      let name = '';
      for (;;) {
        const part = this.toks[i];
        if (part === undefined || part.k !== 'id') throw this.fail.at(part?.line ?? t.line, `class ${cls.name}: unclassifiable extends clause`);
        name += part.t;
        i++;
        if (this.isP(i, '.')) {
          name += '.';
          i++;
        } else break;
      }
      cls.extendsName = name;
      if (this.isP(i, '<')) i = this.skipAngles(i);
    }
    const imp = this.toks[i];
    if (imp !== undefined && imp.k === 'id' && imp.t === 'implements') {
      i++;
      while (i < this.toks.length && !this.isP(i, '{')) {
        if (this.isP(i, '<')) i = this.skipAngles(i);
        else i++;
      }
    }
    if (!this.isP(i, '{')) throw this.fail.at(this.toks[i]?.line ?? cls.line, `class ${cls.name}: expected "{"`);
    return i + 1;
  }
}

// ---------------------------------------------------------------------------------------------
// Public API

/** Classes exported by index.ts and every class their extends chains reach; own members only. */
export function extractShimMembers(files: readonly ShimSource[]): ShimMemberTable {
  const byName = new Map<string, RawClass>();
  let exported: string[] | null = null;
  for (const f of files) {
    const fail = new Fail(f.path);
    const scanner = new Scanner(tokenize(f.text, fail), fail);
    const r = scanner.scan(f.path);
    for (const c of r.classes) {
      const dup = byName.get(c.name);
      if (dup !== undefined) throw fail.at(c.line, `class ${c.name} is also declared in ${dup.path}`);
      byName.set(c.name, c);
    }
    if (f.path === 'index.ts') exported = r.exported;
  }
  if (exported === null) throw new ShimDeclarationError('index.ts:1: index.ts is missing');

  const wanted = new Set<string>();
  const visit = (name: string): void => {
    if (wanted.has(name)) return;
    const c = byName.get(name);
    if (c === undefined) return;
    wanted.add(name);
    if (c.extendsName !== null) {
      if (!byName.has(c.extendsName)) {
        throw new ShimDeclarationError(`${c.path}:${c.line}: class ${c.name} extends ${c.extendsName}, which is not declared in the Shim`);
      }
      visit(c.extendsName);
    }
  };
  for (const name of exported) visit(name);

  const table: Record<string, ShimClassMembers> = {};
  for (const name of [...wanted].sort()) {
    const c = byName.get(name)!;
    const seen = new Map<string, ShimMemberKind>();
    for (const m of c.members) {
      const prior = seen.get(m.name);
      if (prior !== undefined && prior !== m.kind) {
        throw new ShimDeclarationError(`${c.path}:${c.line}: class ${c.name} declares "${m.name}" as both a method and a property`);
      }
      seen.set(m.name, m.kind);
    }
    const members = [...seen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([n, kind]) => ({ name: n, kind }));
    table[name] = { extends: c.extendsName, members };
  }
  return table;
}

const HEADER = '// Generated by "npm run gen:shim-members" from template/shim/. Do not edit.';
const TABLE_DECL = 'export const SHIM_MEMBER_TABLE: ShimMemberTable = ';

/** The text of shimMembers.generated.ts: canonical JSON with sorted keys, one class per line. */
export function renderShimMembersTs(table: ShimMemberTable): string {
  const names = Object.keys(table).sort();
  const lines = names.map((n) => {
    const c = table[n]!;
    const members = c.members.map((m) => `{"name":${JSON.stringify(m.name)},"kind":${JSON.stringify(m.kind)}}`).join(',');
    return `  ${JSON.stringify(n)}: {"extends":${JSON.stringify(c.extends)},"members":[${members}]}`;
  });
  const body = lines.length === 0 ? '{}' : `{\n${lines.join(',\n')}\n}`;
  return `${HEADER}\nimport type { ShimMemberTable } from './shimMembers';\n${TABLE_DECL}${body};\n`;
}

/** Inverse of renderShimMembersTs. */
export function parseShimMembersTs(text: string): ShimMemberTable {
  const bad = (problem: string): ShimDeclarationError => new ShimDeclarationError(`shimMembers.generated.ts:1: ${problem}`);
  const at = text.indexOf(TABLE_DECL);
  const end = text.lastIndexOf(';');
  if (at < 0 || end < at) throw bad('no SHIM_MEMBER_TABLE declaration');
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(at + TABLE_DECL.length, end));
  } catch {
    throw bad('the table is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw bad('the table is not an object');
  const table: Record<string, ShimClassMembers> = {};
  for (const name of Object.keys(raw)) {
    const c = (raw as Record<string, unknown>)[name];
    if (typeof c !== 'object' || c === null) throw bad(`class ${name} is not an object`);
    const ext = (c as { extends?: unknown }).extends;
    const members = (c as { members?: unknown }).members;
    if ((ext !== null && typeof ext !== 'string') || !Array.isArray(members)) throw bad(`class ${name} has a wrong shape`);
    const list: Array<{ name: string; kind: ShimMemberKind }> = [];
    for (const m of members as unknown[]) {
      const mm = m as { name?: unknown; kind?: unknown } | null;
      if (mm === null || typeof mm !== 'object' || typeof mm.name !== 'string' || (mm.kind !== 'method' && mm.kind !== 'property')) {
        throw bad(`class ${name} has a wrong member`);
      }
      list.push({ name: mm.name, kind: mm.kind });
    }
    table[name] = { extends: ext, members: list };
  }
  return table;
}
