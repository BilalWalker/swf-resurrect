// Core: no node:*, no clock, no randomness, no locale-dependent calls.
// Decides which linked classes cannot load and must fall back to a plain MovieClip (breadth design 19.2).
import type { GateError } from '../translate/typeCheckGate';

import type { QualifiedName } from '../convert/qualifiedName';


/** What the Bundler_Guard said about one class file (design 21.4). Phase `parse`: position in the transformed text. */
export type BundlerVerdict =
  | { ok: true }
  | { ok: false; phase: 'transform' | 'parse'; message: string; line: number; column: number };

/** An import or re-export that is still in the file after the TypeScript transform. `names` is sorted; [] for a side-effect import. */
export interface SurvivingImport {
  specifier: string;
  names: readonly string[];
}

export interface BundlerCheckData {
  verdict: BundlerVerdict;
  imports: readonly SurvivingImport[];
}

export type OmissionReason =
  | { kind: 'missing-source' }
  | { kind: 'emit-failed' }
  /** The bundler's parser or the TypeScript transform rejects the file (Requirement 26.2). */
  | { kind: 'bundler-parse'; phase: 'transform' | 'parse'; message: string; line: number; column: number }
  /** Only when the guard could not run: a syntactic TypeScript diagnostic (Requirement 26.7). */
  | { kind: 'syntax-error'; count: number; firstLine: number; firstMessage: string }
  | { kind: 'unresolved-import'; specifier: string; line: number }
  /** The class imports `name` from `target`, whose planned file exports no such binding. */
  | { kind: 'missing-export'; name: string; target: QualifiedName; line: number }
  | { kind: 'extends-omitted'; base: QualifiedName }
  | { kind: 'imports-omitted'; imported: QualifiedName };

export interface ClassOmission {
  className: QualifiedName;
  reason: OmissionReason;
  /** Sorted ids of the linked symbols of this class; [] for an unlinked class. */
  symbolIds: number[];
}

export interface ImportedName {
  target: QualifiedName;
  name: string;
  /** 1-based line of the import. */
  line: number;
  /** Specifier text of the import in the emitted file; absent: the import counts as surviving. */
  specifier?: string;
}

export interface OmissionClass {
  className: QualifiedName;
  /** Final emitted path. */
  path: string;
  extendsQualified: QualifiedName | null;
  /** Sorted, unique. */
  importsQualified: readonly QualifiedName[];
  /** Every binding this class imports from another emitted class; absent means not checked. */
  importedNames?: readonly ImportedName[];
  /** Names the planned file exports; null when they cannot be told; absent means not checked. */
  exports?: readonly string[] | null;
  handwritten: boolean;
  /** false when Emit failed to produce the file. */
  produced: boolean;
  /** The guard's check of the planned final text; absent: the guard did not run and the Requirement 23 rules apply. */
  bundler?: BundlerCheckData;
  /** Edges of the class imports with the specifier text of the emitted file; absent: every edge counts. */
  importEdges?: readonly { target: QualifiedName; specifier: string }[];
}

export interface LinkedSymbol {
  symbolId: number;
  className: QualifiedName;
}

export interface LooseClass {
  className: QualifiedName;
  count: number;
  firstLine: number;
  firstMessage: string;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function compareErrors(a: GateError, b: GateError): number {
  return a.line - b.line || a.column - b.column || a.code - b.code || cmp(a.message, b.message);
}

/** True when the specifier, resolved against the directory of `fromFile`, is not the Shim or the runtime. */
export function isEmittedSpecifier(fromFile: string, specifier: string): boolean {
  const dir = fromFile.split('/').slice(0, -1);
  const out: string[] = [];
  for (const seg of [...dir, ...specifier.split('/')]) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
    } else out.push(seg);
  }
  return out[0] !== 'shim' && out[0] !== 'runtime';
}

function errorsByFile(gateErrors: readonly GateError[]): Map<string, GateError[]> {
  const byFile = new Map<string, GateError[]>();
  for (const e of gateErrors) {
    const list = byFile.get(e.file);
    if (list) list.push(e);
    else byFile.set(e.file, [e]);
  }
  for (const list of byFile.values()) list.sort(compareErrors);
  return byFile;
}

function survivingSpecifiers(check: BundlerCheckData): ReadonlySet<string> {
  return new Set(check.imports.map((i) => i.specifier));
}

/** An imported binding survives when the file still imports it by that name or by `*`; no specifier on the record: it counts. */
function importSurvives(check: BundlerCheckData, i: ImportedName): boolean {
  if (i.specifier === undefined) return true;
  return check.imports.some((s) => s.specifier === i.specifier && (s.names.includes(i.name) || s.names.includes('*')));
}

/** Sorted classes this class imports along edges that the transform kept. */
function survivingImports(c: OmissionClass): QualifiedName[] {
  const all = [...c.importsQualified].sort(cmp);
  if (c.bundler === undefined || c.importEdges === undefined) return all;
  const kept = survivingSpecifiers(c.bundler);
  const targets = new Set(c.importEdges.filter((e) => kept.has(e.specifier)).map((e) => e.target));
  return all.filter((n) => targets.has(n));
}

export function decideClassOmissions(
  gateErrors: readonly GateError[],
  classes: readonly OmissionClass[],
  linked: readonly LinkedSymbol[],
): ClassOmission[] {
  const byFile = errorsByFile(gateErrors);
  const known = new Set(classes.map((c) => c.className));
  const reasons = new Map<QualifiedName, OmissionReason>();
  const exportsOf = new Map<QualifiedName, ReadonlySet<string> | null>();
  for (const c of classes) if (c.exports !== undefined) exportsOf.set(c.className, c.exports === null ? null : new Set(c.exports));

  // Rule 1: linked classes with no source and no override.
  for (const s of linked) if (!known.has(s.className)) reasons.set(s.className, { kind: 'missing-source' });

  // Rule 2: classes that cannot load.
  for (const c of classes) {
    const check = c.bundler;
    // A failing check omits a class, a handwritten one included (Requirement 26.10).
    if (check !== undefined && !check.verdict.ok && (c.handwritten || c.produced)) {
      const v = check.verdict;
      reasons.set(c.className, { kind: 'bundler-parse', phase: v.phase, message: v.message, line: v.line, column: v.column });
      continue;
    }
    if (c.handwritten) continue;
    if (!c.produced) {
      reasons.set(c.className, { kind: 'emit-failed' });
      continue;
    }
    const surviving = check === undefined ? undefined : survivingSpecifiers(check);
    const errs = byFile.get(c.path) ?? [];
    // While the guard ran it is the only authority on parsing: a syntactic diagnostic never omits.
    const syntactic = check === undefined ? errs.filter((e) => e.syntactic) : [];
    if (syntactic.length > 0) {
      reasons.set(c.className, {
        kind: 'syntax-error',
        count: syntactic.length,
        firstLine: syntactic[0].line,
        firstMessage: syntactic[0].message,
      });
      continue;
    }
    const unresolved = errs.find(
      (e) =>
        (e.code === 2307 || e.code === 2792) &&
        e.specifier !== null &&
        e.specifier.startsWith('.') &&
        isEmittedSpecifier(c.path, e.specifier) &&
        (surviving === undefined || surviving.has(e.specifier)),
    );
    if (unresolved && unresolved.specifier !== null) {
      reasons.set(c.className, { kind: 'unresolved-import', specifier: unresolved.specifier, line: unresolved.line });
      continue;
    }
    // An import whose target module does not export the binding cannot link, whatever the reason
    // (an AS3 interface written as comments, an empty file, a renamed export). Read from the planned
    // text of the target, not from gate codes: TS2306 (not a module) names no binding.
    const missing = [...(c.importedNames ?? [])]
      .filter((i) => {
        const exp = exportsOf.get(i.target);
        return (
          i.target !== c.className &&
          exp !== undefined &&
          exp !== null &&
          !exp.has(i.name) &&
          (check === undefined || importSurvives(check, i))
        );
      })
      .sort((a, b) => cmp(a.target, b.target) || cmp(a.name, b.name))[0];
    if (missing !== undefined) {
      reasons.set(c.className, { kind: 'missing-export', name: missing.name, target: missing.target, line: missing.line });
    }
  }

  // Rule 3: propagation to a fixed point. Decisions of one round read the set of the previous round.
  const ordered = [...classes].sort((a, b) => cmp(a.className, b.className));
  for (;;) {
    const added = new Map<QualifiedName, OmissionReason>();
    for (const c of ordered) {
      if (c.handwritten || reasons.has(c.className)) continue;
      if (c.extendsQualified !== null && reasons.has(c.extendsQualified)) {
        added.set(c.className, { kind: 'extends-omitted', base: c.extendsQualified });
        continue;
      }
      const imported = survivingImports(c).find((n) => reasons.has(n));
      if (imported !== undefined) added.set(c.className, { kind: 'imports-omitted', imported });
    }
    if (added.size === 0) break;
    for (const [k, v] of added) reasons.set(k, v);
  }

  const idsByClass = new Map<QualifiedName, number[]>();
  for (const s of linked) {
    const ids = idsByClass.get(s.className);
    if (ids) ids.push(s.symbolId);
    else idsByClass.set(s.className, [s.symbolId]);
  }
  return [...reasons.entries()]
    .sort(([a], [b]) => cmp(a, b))
    .map(([className, reason]) => ({
      className,
      reason,
      symbolIds: [...(idsByClass.get(className) ?? [])].sort((a, b) => a - b),
    }));
}

/** Registered translated classes (not omitted, not handwritten) with at least one GateError in their own file. */
export function looseClasses(
  gateErrors: readonly GateError[],
  classes: readonly OmissionClass[],
  omitted: readonly ClassOmission[],
): LooseClass[] {
  const byFile = errorsByFile(gateErrors);
  const gone = new Set(omitted.map((o) => o.className));
  const out = new Map<QualifiedName, LooseClass>();
  for (const c of classes) {
    if (c.handwritten || gone.has(c.className) || out.has(c.className)) continue;
    const errs = byFile.get(c.path);
    if (!errs || errs.length === 0) continue;
    out.set(c.className, { className: c.className, count: errs.length, firstLine: errs[0].line, firstMessage: errs[0].message });
  }
  return [...out.values()].sort((a, b) => cmp(a.className, b.className));
}

export function omissionMessage(o: ClassOmission): string {
  const r = o.reason;
  let why: string;
  switch (r.kind) {
    case 'missing-source':
      why = 'no source for the class';
      break;
    case 'emit-failed':
      why = 'the class file was not produced';
      break;
    case 'bundler-parse':
      why = `Vite cannot ${r.phase === 'transform' ? 'transform' : 'parse'} the file: ${r.message} (line ${r.line}, column ${r.column}${r.phase === 'parse' ? ', in the transformed text' : ''})`;
      break;
    case 'syntax-error':
      why = `${r.count} syntax error${r.count === 1 ? '' : 's'}, first at line ${r.firstLine}: ${r.firstMessage}`;
      break;
    case 'unresolved-import':
      why = `import "${r.specifier}" at line ${r.line} resolves to no emitted file`;
      break;
    case 'missing-export':
      why = `imports ${r.name} from ${r.target} at line ${r.line}, but that file exports no ${r.name}`;
      break;
    case 'extends-omitted':
      why = `extends ${r.base}, which is omitted`;
      break;
    case 'imports-omitted':
      why = `imports ${r.imported}, which is omitted`;
      break;
  }
  const tail =
    o.symbolIds.length === 0
      ? 'no symbol is linked to it'
      : `symbol${o.symbolIds.length === 1 ? '' : 's'} ${o.symbolIds.join(', ')} become${o.symbolIds.length === 1 ? 's' : ''} plain MovieClip`;
  return `class ${o.className} is left out of the registry: ${why}; ${tail}`;
}
