// Flash API gaps of one translated file (robustness Requirement 17.5, design D-A3). Pure: no I/O.
//
// A use is a gap when a file imports a `flash.*` class that is neither in the Shim nor in the
// Flash_API_Table, or whose policy is `gap` (class gap); or when it reads a member of a `stub` class
// that the table entry does not list (member gap). Nothing is generated for a gap, so the type error
// stays visible in the Translation_Report.
//
// Scope of the member scan (a limit, not a claim of completeness): `name.member` where `name` is declared
// once in the file as `name: Class`, and `Class.member` for a static use. Other receivers are not typed.

import { entryOf, policyOf } from './flashApiTable';
import type { ImportDecl } from './importPlan';
import type { ShimMemberTable } from './shimMembers';
import type { Token } from './tokenizer';

export interface FlashApiGapUse {
  /** Qualified Flash class, for example `flash.media.Camera`. */
  qualified: string;
  /** Absent for a class gap. */
  member?: string;
  /** 1-based AS3 line of the first use. */
  line: number;
}

export interface FlashApiGapInput {
  tokens: readonly Token[];
  imports: readonly ImportDecl[];
  shimNames: ReadonlySet<string>;
  shimMembers: ShimMemberTable;
  /** Simple names the file declares; a declared name is never a Flash class. */
  declared: ReadonlySet<string>;
  /** Qualified_Names of the classes of the project; one of them wins over a Flash class of the same name. */
  known: ReadonlySet<string>;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function simpleOf(qn: string): string {
  return qn.slice(qn.lastIndexOf('.') + 1);
}

/** Members a stub class answers for: the table entry, plus the Shim members of its class and bases. */
function stubMembers(qualified: string, shimMembers: ShimMemberTable): Set<string> {
  const names = new Set<string>();
  for (const m of entryOf(qualified)?.members ?? []) names.add(m.name);
  let cls: string | null = simpleOf(qualified);
  const seen = new Set<string>();
  while (cls !== null && !seen.has(cls)) {
    seen.add(cls);
    const row: ShimMemberTable[string] | undefined = shimMembers[cls];
    if (row === undefined) break;
    for (const m of row.members) names.add(m.name);
    cls = row.extends;
  }
  return names;
}

/** Sorted by (qualified, member, line); one entry per (qualified, member). */
export function findFlashApiGaps(input: FlashApiGapInput): FlashApiGapUse[] {
  // Explicit `flash.*` imports and, for the table's classes, wildcard imports.
  const candidates = new Map<string, string>(); // simple name -> qualified
  const wildcards = input.imports.filter((i) => i.wildcard && i.path.startsWith('flash.')).map((i) => i.path);
  for (const imp of input.imports) {
    if (imp.wildcard || !imp.path.startsWith('flash.')) continue;
    const simple = simpleOf(imp.path);
    if (!input.declared.has(simple) && !input.known.has(imp.path)) candidates.set(simple, imp.path);
  }
  const sig = input.tokens.filter((t) => t.kind !== 'comment');
  // Skip the import statements themselves: a use is an identifier outside them.
  const used = new Map<string, number>(); // simple name -> first line
  const typed = new Map<string, Set<string>>(); // variable name -> simple class names
  let inImport = false;
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i];
    if (t.kind === 'id' && t.text === 'import' && sig[i - 1]?.text !== '.') inImport = true;
    if (inImport) {
      if (t.kind === 'punct' && t.text === ';') inImport = false;
      continue;
    }
    if (t.kind !== 'id' || sig[i - 1]?.text === '.') continue;
    if (!used.has(t.text)) used.set(t.text, t.line);
    if (sig[i + 1]?.text === ':' && sig[i + 2]?.kind === 'id') {
      const set = typed.get(t.text) ?? new Set<string>();
      set.add(sig[i + 2].text);
      typed.set(t.text, set);
    }
  }
  for (const pkg of wildcards) {
    for (const [name] of used) {
      const q = `${pkg}.${name}`;
      if (entryOf(q) !== undefined && !input.declared.has(name) && !input.known.has(q) && !candidates.has(name)) candidates.set(name, q);
    }
  }

  const out = new Map<string, FlashApiGapUse>();
  const add = (qualified: string, member: string | undefined, line: number): void => {
    const key = member === undefined ? qualified : `${qualified}.${member}`;
    const prev = out.get(key);
    if (prev === undefined || line < prev.line) out.set(key, { qualified, ...(member === undefined ? {} : { member }), line });
  };

  const usable = new Map<string, string>(); // simple -> qualified, for classes that are used
  for (const [simple, qualified] of candidates) {
    const line = used.get(simple);
    if (line === undefined) continue;
    const policy = policyOf(qualified);
    if (policy === 'gap' || (policy === 'absent' && !input.shimNames.has(simple))) add(qualified, undefined, line);
    else if (policy === 'stub') usable.set(simple, qualified);
  }

  if (usable.size > 0) {
    const allowed = new Map<string, Set<string>>();
    const allowedOf = (q: string): Set<string> => {
      let s = allowed.get(q);
      if (s === undefined) allowed.set(q, (s = stubMembers(q, input.shimMembers)));
      return s;
    };
    for (let i = 0; i + 2 < sig.length; i++) {
      const recv = sig[i];
      const dot = sig[i + 1];
      const mem = sig[i + 2];
      if (recv.kind !== 'id' || dot.text !== '.' || dot.kind !== 'punct' || mem.kind !== 'id') continue;
      if (sig[i - 1]?.text === '.' || sig[i - 1]?.text === 'import') continue;
      let cls: string | undefined = usable.get(recv.text); // static use
      if (cls === undefined) {
        const types = typed.get(recv.text);
        if (types !== undefined && types.size === 1) cls = usable.get([...types][0]);
      }
      if (cls !== undefined && !allowedOf(cls).has(mem.text)) add(cls, mem.text, mem.line);
    }
  }
  return [...out.values()].sort(
    (a, b) => cmp(a.qualified, b.qualified) || cmp(a.member ?? '', b.member ?? '') || a.line - b.line,
  );
}

/** The report message of one use. */
export function flashApiGapMessage(className: string, use: FlashApiGapUse): string {
  const what = use.member === undefined ? use.qualified : `${use.qualified}.${use.member}`;
  const why =
    use.member !== undefined
      ? 'a member the stub does not have'
      : policyOf(use.qualified) === 'gap'
        ? 'a Flash class with policy gap'
        : 'a Flash class that is neither in the Shim nor in the Flash_API_Table';
  return `${className} line ${use.line}: ${what} is ${why}; no stub is generated and the type error stays`;
}
