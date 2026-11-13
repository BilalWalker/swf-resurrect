/**
 * Class member tables (Requirement 22, design 18.2 and 18.3). Core: no node modules, no
 * regular expressions. Built from scanner nodes plus the generated Shim_Member_Table; used by the
 * implicit-this resolver to find which class of an `extends` chain declares a bare name.
 */

import type { QualifiedName } from '../convert/qualifiedName';
import type { ClassNode, Node } from './scanner';
import type { ShimClassMembers, ShimMemberTable } from './shimMembers';

export type MemberKind = 'field' | 'constant' | 'method' | 'accessor';

export type BaseRef =
  | { kind: 'none' }
  | { kind: 'translated'; qualified: QualifiedName }
  | { kind: 'shim'; name: string }
  | { kind: 'unknown'; name: string };

export interface ClassMembers {
  qualified: QualifiedName;
  simpleName: string;
  instance: ReadonlyMap<string, MemberKind>;
  statics: ReadonlyMap<string, MemberKind>;
  base: BaseRef;
}

export interface MemberTables {
  classes: ReadonlyMap<QualifiedName, ClassMembers>;
  shim: ShimMemberTable;
}

export interface FileForTables {
  qualified: QualifiedName;
  nodes: readonly Node[];
}

export type Found =
  | { rule: 'own-instance' }
  | { rule: 'own-static' }
  | { rule: 'inherited-static'; owner: QualifiedName }
  | { rule: 'translated-super'; owner: QualifiedName }
  | { rule: 'shim'; owner: string };
export type MemberKindFound = Found & { kind: MemberKind };

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function packageOf(qn: string): string {
  const i = qn.lastIndexOf('.');
  return i < 0 ? '' : qn.slice(0, i);
}

function simpleOf(qn: string): string {
  return qn.slice(qn.lastIndexOf('.') + 1);
}

function join(pkg: string, simple: string): QualifiedName {
  return pkg === '' ? simple : `${pkg}.${simple}`;
}

interface FileScan {
  imports: Array<{ path: string; wildcard: boolean }>;
  classes: ClassNode[];
}

/** Imports and classes of a file, whether they sit in the package body or after it. */
function scanFile(nodes: readonly Node[], out: FileScan = { imports: [], classes: [] }): FileScan {
  for (const n of nodes) {
    if (n.kind === 'package') scanFile(n.body, out);
    else if (n.kind === 'import') out.imports.push({ path: n.path, wildcard: n.wildcard });
    else if (n.kind === 'class') out.classes.push(n);
  }
  return out;
}

function classTables(cls: ClassNode): { instance: Map<string, MemberKind>; statics: Map<string, MemberKind> } {
  const instance = new Map<string, MemberKind>();
  const statics = new Map<string, MemberKind>();
  const add = (mods: readonly string[], name: string, kind: MemberKind): void => {
    const target = mods.includes('static') ? statics : instance;
    // A getter and a setter are one accessor; a repeated name keeps its first kind.
    if (!target.has(name)) target.set(name, kind);
  };
  for (const m of cls.body.nodes) {
    if (m.kind === 'field') {
      for (const d of m.decl.declarators) add(m.modifiers, d.name, m.decl.isConst ? 'constant' : 'field');
    } else if (m.kind === 'method') {
      if (!m.isConstructor) add(m.modifiers, m.name, 'method');
    } else if (m.kind === 'accessor') {
      add(m.modifiers, m.name, 'accessor');
    }
  }
  return { instance, statics };
}

export function buildMemberTables(files: readonly FileForTables[], shim: ShimMemberTable): MemberTables {
  const scans = files.map((f) => ({ file: f, scan: scanFile(f.nodes) }));

  // Key of every class: the file's Qualified_Name for the class named like the file, `<package>.<name>` otherwise.
  const keyOf = (file: FileForTables, cls: ClassNode): QualifiedName =>
    cls.name === simpleOf(file.qualified) ? file.qualified : join(packageOf(file.qualified), cls.name);

  const known = new Set<QualifiedName>();
  for (const { file, scan } of scans) for (const c of scan.classes) known.add(keyOf(file, c));

  const resolveBase = (selfPkg: string, imports: FileScan['imports'], name: string): BaseRef => {
    if (name.includes('.')) {
      if (known.has(name)) return { kind: 'translated', qualified: name };
      const last = simpleOf(name);
      return Object.hasOwn(shim, last) ? { kind: 'shim', name: last } : { kind: 'unknown', name };
    }
    const explicit = new Set<QualifiedName>();
    for (const imp of imports) {
      if (!imp.wildcard && simpleOf(imp.path) === name && known.has(imp.path)) explicit.add(imp.path);
    }
    let cands = [...explicit].sort(cmp);
    if (cands.length === 0) {
      const samePkg = join(selfPkg, name);
      if (known.has(samePkg)) cands = [samePkg];
    }
    if (cands.length === 0) {
      const wild = new Set<QualifiedName>();
      for (const imp of imports) {
        if (!imp.wildcard) continue;
        const qn = join(imp.path, name);
        if (known.has(qn)) wild.add(qn);
      }
      cands = [...wild].sort(cmp);
    }
    if (cands.length === 1) return { kind: 'translated', qualified: cands[0]! };
    if (cands.length > 1) return { kind: 'unknown', name };
    return Object.hasOwn(shim, name) ? { kind: 'shim', name } : { kind: 'unknown', name };
  };

  const classes = new Map<QualifiedName, ClassMembers>();
  for (const { file, scan } of scans) {
    const pkg = packageOf(file.qualified);
    for (const c of scan.classes) {
      const qualified = keyOf(file, c);
      if (classes.has(qualified)) continue;
      const { instance, statics } = classTables(c);
      const base: BaseRef = c.extendsName === null ? { kind: 'none' } : resolveBase(pkg, scan.imports, c.extendsName);
      classes.set(qualified, { qualified, simpleName: c.name, instance, statics, base });
    }
  }
  return { classes, shim };
}

/** Walks the translated `extends` chain from `cls` (inclusive); stops at a cycle. Returns the last class and its end. */
function walkChain(t: MemberTables, cls: QualifiedName, visit: (q: QualifiedName, m: ClassMembers) => boolean): BaseRef {
  const seen = new Set<QualifiedName>();
  let cur: QualifiedName = cls;
  for (;;) {
    const m = t.classes.get(cur);
    if (m === undefined) return { kind: 'unknown', name: cur };
    if (seen.has(cur)) return { kind: 'unknown', name: m.simpleName };
    seen.add(cur);
    if (visit(cur, m)) return { kind: 'none' };
    if (m.base.kind !== 'translated') return m.base;
    cur = m.base.qualified;
  }
}

export function chainEnd(t: MemberTables, cls: QualifiedName): BaseRef {
  return walkChain(t, cls, () => false);
}

function shimLookup(t: MemberTables, start: string, name: string): MemberKindFound | null {
  const seen = new Set<string>();
  let cur: string | null = start;
  while (cur !== null && !seen.has(cur) && Object.hasOwn(t.shim, cur)) {
    seen.add(cur);
    const entry: ShimClassMembers = t.shim[cur]!;
    const hit = entry.members.find((m) => m.name === name);
    if (hit !== undefined) {
      return { rule: 'shim', owner: cur, kind: hit.kind === 'method' ? 'method' : 'field' };
    }
    cur = entry.extends;
  }
  return null;
}

/**
 * Instance context: one walk of the chain, nearest class first. In each translated class the instance
 * table is tried before the static table; after the last translated class the Shim chain (instance
 * members only) is walked.
 */
export function lookupMember(t: MemberTables, cls: QualifiedName, name: string): MemberKindFound | null {
  let found: MemberKindFound | null = null;
  const end = walkChain(t, cls, (q, m) => {
    const inst = m.instance.get(name);
    if (inst !== undefined) {
      found = q === cls ? { rule: 'own-instance', kind: inst } : { rule: 'translated-super', owner: q, kind: inst };
      return true;
    }
    const st = m.statics.get(name);
    if (st !== undefined) {
      found = q === cls ? { rule: 'own-static', kind: st } : { rule: 'inherited-static', owner: q, kind: st };
      return true;
    }
    return false;
  });
  if (found !== null) return found;
  return end.kind === 'shim' ? shimLookup(t, end.name, name) : null;
}

/** Instance members only (rules 1, 3, 4 in that order). */
export function lookupInstance(t: MemberTables, cls: QualifiedName, name: string): MemberKindFound | null {
  let found: MemberKindFound | null = null;
  const end = walkChain(t, cls, (q, m) => {
    const inst = m.instance.get(name);
    if (inst === undefined) return false;
    found = q === cls ? { rule: 'own-instance', kind: inst } : { rule: 'translated-super', owner: q, kind: inst };
    return true;
  });
  if (found !== null) return found;
  return end.kind === 'shim' ? shimLookup(t, end.name, name) : null;
}

/**
 * Declaration order of `names` (Requirement 22.13): the instance methods of `cls` in declaration order,
 * then those of its translated superclasses, nearest base first and in declaration order within each base.
 * A name already placed by a nearer class is not placed again; a name no class declares as a method is
 * dropped.
 */
export function orderByDeclaration(t: MemberTables, cls: QualifiedName, names: ReadonlySet<string>): string[] {
  const out: string[] = [];
  walkChain(t, cls, (_q, m) => {
    for (const [name, kind] of m.instance) {
      if (kind === 'method' && names.has(name) && !out.includes(name)) out.push(name);
    }
    return false;
  });
  return out;
}

/** Static context (rule 2): the own static, then the nearest static of a translated superclass; owner is the declaring class. */
export function lookupStatic(t: MemberTables, cls: QualifiedName, name: string): MemberKindFound | null {
  let found: MemberKindFound | null = null;
  walkChain(t, cls, (q, m) => {
    const st = m.statics.get(name);
    if (st === undefined) return false;
    found = q === cls ? { rule: 'own-static', kind: st } : { rule: 'inherited-static', owner: q, kind: st };
    return true;
  });
  return found;
}
