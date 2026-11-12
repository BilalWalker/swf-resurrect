// Import plan for one translated file (Core, pure; design 14.1 and 14.3).
//
// `planFileImports` decides, for every name a file refers to, which known class it
// is and under which binding it is imported. Scoping order for a bare name that the
// file does not declare: explicit import, same package, wildcard import, Shim name.
// Two different classes at the winning level are an ambiguity: neither is bound and
// one Diagnostic names them. Dotted chains and `forced` targets (inherited statics,
// design 18.5) are bound under the simple name unless it is taken, then under an alias
// built from the Qualified_Name.

import type { QualifiedName } from '../convert/qualifiedName';
import type { Diagnostic } from './types';

/** From the scanner's `ImportNode`: `path` has no trailing `.*`. */
export interface ImportDecl {
  path: string;
  wildcard: boolean;
}

export interface ImportPlanInput {
  selfQualified: QualifiedName;
  /** Simple names declared in the file. */
  declared: ReadonlySet<string>;
  shimNames: ReadonlySet<string>;
  /** Qualified_Names of every other class with a source. */
  known: ReadonlySet<QualifiedName>;
  imports: readonly ImportDecl[];
  /** Identifier not preceded by `.`, or an extends/implements name -> first line. */
  bare: ReadonlyMap<string, number>;
  /** Dotted expressions that equal a known Qualified_Name, in source order. */
  chains: ReadonlyArray<{ text: string; qn: QualifiedName; line: number }>;
  /** Targets bound as if the file named them; no effect when already bound. */
  forced?: readonly QualifiedName[];
}

export interface PlannedImport {
  target: QualifiedName;
  binding: string;
  aliased: boolean;
}

export interface ImportPlan {
  /** Sorted by (target, binding) in code-unit order. */
  imports: PlannedImport[];
  bindingOfBare: ReadonlyMap<string, QualifiedName>;
  /** Chain text -> binding used at that expression. */
  bindingOfChain: ReadonlyMap<string, string>;
  /** Ambiguities, sorted by (line, message). */
  diagnostics: Diagnostic[];
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function simpleOf(qn: QualifiedName): string {
  return qn.slice(qn.lastIndexOf('.') + 1);
}

function packageOf(qn: QualifiedName): string {
  const i = qn.lastIndexOf('.');
  return i < 0 ? '' : qn.slice(0, i);
}

function join(pkg: string, simple: string): QualifiedName {
  return pkg === '' ? simple : `${pkg}.${simple}`;
}

function listNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function planFileImports(input: ImportPlanInput): ImportPlan {
  const { selfQualified, declared, shimNames, known, imports } = input;
  const selfPkg = packageOf(selfQualified);
  const usable = (qn: QualifiedName): boolean => known.has(qn) && qn !== selfQualified;

  const bindingOfTarget = new Map<QualifiedName, string>();
  const takenBindings = new Set<string>();
  const ambiguous = new Set<string>();
  const bindingOfBare = new Map<string, QualifiedName>();
  const diagnostics: Diagnostic[] = [];

  /** Candidates of the first scoping level that has any known class for `name`. */
  const levelCandidates = (name: string): QualifiedName[] => {
    const explicit = new Set<QualifiedName>();
    for (const imp of imports) {
      if (imp.wildcard) continue;
      if (simpleOf(imp.path) === name && usable(imp.path)) explicit.add(imp.path);
    }
    if (explicit.size > 0) return [...explicit].sort(cmp);
    const samePkg = join(selfPkg, name);
    if (usable(samePkg)) return [samePkg];
    const wild = new Set<QualifiedName>();
    for (const imp of imports) {
      if (!imp.wildcard) continue;
      const qn = join(imp.path, name);
      if (usable(qn)) wild.add(qn);
    }
    return [...wild].sort(cmp);
  };

  // 1. Bare names, in code-unit order so the result does not depend on map order.
  const bareNames = [...input.bare.keys()].sort(cmp);
  for (const name of bareNames) {
    if (declared.has(name)) continue;
    const cands = levelCandidates(name);
    if (cands.length === 0) continue; // a Shim name or unresolved: not a class import
    if (cands.length > 1) {
      ambiguous.add(name);
      diagnostics.push({
        kind: 'unsupported-construct',
        line: input.bare.get(name) as number,
        message: `"${name}" is ambiguous between ${listNames(cands)}; neither is imported`,
      });
      continue;
    }
    const target = cands[0];
    bindingOfBare.set(name, target);
    bindingOfTarget.set(target, name);
    takenBindings.add(name);
  }

  const isTaken = (binding: string): boolean =>
    takenBindings.has(binding) || declared.has(binding) || shimNames.has(binding) || ambiguous.has(binding);

  const bindTarget = (target: QualifiedName): string => {
    const existing = bindingOfTarget.get(target);
    if (existing !== undefined) return existing;
    const simple = simpleOf(target);
    let binding = simple;
    if (isTaken(binding)) {
      const base = target.split('.').join('_');
      binding = base;
      for (let n = 2; isTaken(binding); n++) binding = `${base}_${n}`;
    }
    bindingOfTarget.set(target, binding);
    takenBindings.add(binding);
    return binding;
  };

  // 2. Chains and forced targets, one target at a time in code-unit order.
  const extra = new Set<QualifiedName>();
  for (const c of input.chains) if (usable(c.qn)) extra.add(c.qn);
  for (const f of input.forced ?? []) if (usable(f)) extra.add(f);
  for (const target of [...extra].sort(cmp)) bindTarget(target);

  const bindingOfChain = new Map<string, string>();
  for (const c of input.chains) {
    if (!usable(c.qn)) continue;
    bindingOfChain.set(c.text, bindingOfTarget.get(c.qn) as string);
  }

  const planned: PlannedImport[] = [];
  for (const [target, binding] of bindingOfTarget) {
    planned.push({ target, binding, aliased: binding !== simpleOf(target) });
  }
  planned.sort((a, b) => cmp(a.target, b.target) || cmp(a.binding, b.binding));
  diagnostics.sort((a, b) => a.line - b.line || cmp(a.message, b.message));

  return { imports: planned, bindingOfBare, bindingOfChain, diagnostics };
}
