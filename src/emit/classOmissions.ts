// Core: no node:*, no clock, no randomness, no locale-dependent calls.
// Decides which linked classes cannot load and must fall back to a plain MovieClip (breadth design 19.2).
import type { GateError } from '../translate/typeCheckGate';

/** Dotted class name; the unnamed package has no dots. */
export type QualifiedName = string;

export type OmissionReason =
  | { kind: 'missing-source' }
  | { kind: 'emit-failed' }
  | { kind: 'syntax-error'; count: number; firstLine: number; firstMessage: string }
  | { kind: 'unresolved-import'; specifier: string; line: number }
  | { kind: 'extends-omitted'; base: QualifiedName }
  | { kind: 'imports-omitted'; imported: QualifiedName };

export interface ClassOmission {
  className: QualifiedName;
  reason: OmissionReason;
  /** Sorted ids of the linked symbols of this class; [] for an unlinked class. */
  symbolIds: number[];
}

export interface OmissionClass {
  className: QualifiedName;
  /** Final emitted path. */
  path: string;
  extendsQualified: QualifiedName | null;
  /** Sorted, unique. */
  importsQualified: readonly QualifiedName[];
  handwritten: boolean;
  /** false when Emit failed to produce the file. */
  produced: boolean;
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

export function decideClassOmissions(
  gateErrors: readonly GateError[],
  classes: readonly OmissionClass[],
  linked: readonly LinkedSymbol[],
): ClassOmission[] {
  const byFile = errorsByFile(gateErrors);
  const known = new Set(classes.map((c) => c.className));
  const reasons = new Map<QualifiedName, OmissionReason>();

  // Rule 1: linked classes with no source and no override.
  for (const s of linked) if (!known.has(s.className)) reasons.set(s.className, { kind: 'missing-source' });

  // Rule 2: classes that cannot load.
  for (const c of classes) {
    if (c.handwritten) continue;
    if (!c.produced) {
      reasons.set(c.className, { kind: 'emit-failed' });
      continue;
    }
    const errs = byFile.get(c.path) ?? [];
    const syntactic = errs.filter((e) => e.syntactic);
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
        isEmittedSpecifier(c.path, e.specifier),
    );
    if (unresolved && unresolved.specifier !== null) {
      reasons.set(c.className, { kind: 'unresolved-import', specifier: unresolved.specifier, line: unresolved.line });
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
      const imported = [...c.importsQualified].sort(cmp).find((n) => reasons.has(n));
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
    case 'syntax-error':
      why = `${r.count} syntax error${r.count === 1 ? '' : 's'}, first at line ${r.firstLine}: ${r.firstMessage}`;
      break;
    case 'unresolved-import':
      why = `import "${r.specifier}" at line ${r.line} resolves to no emitted file`;
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
