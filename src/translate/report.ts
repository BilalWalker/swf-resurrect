// Translation_Report (design section 6). Pure: no I/O, no clock, no randomness.
import { canonicalJson } from '../pipeline/canonicalJson';
import type { UnsupportedFeatureEntry } from '../pipeline/unsupported';
import type { TranslatedClass } from './planTranslate';
import type { GateError, GateResult } from './typeCheckGate';
import type { Diagnostic } from './types';

export type ClassStatus = 'clean' | 'loose' | 'unsupported';

export interface TypeErrorEntry {
  line: number; // emitted .ts line
  column: number;
  code: number;
  message: string;
  /** Convenience only, never used for status. `null` for generated lines and overridden classes. */
  as3Line: number | null;
}

export interface ClassReportEntry {
  className: string;
  status: ClassStatus;
  overridden: boolean;
  diagnostics: Diagnostic[]; // sorted (line, kind); empty when overridden
  typeErrors: TypeErrorEntry[]; // sorted (line, column, code)
}

export interface TranslationReport {
  formatVersion: 1;
  typeCheck: 'ran' | 'skipped';
  classes: ClassReportEntry[]; // sorted by className
  otherErrors: GateError[]; // errors in non-class files
}

export interface ReportClassInput {
  className: string;
  overridden: boolean;
  diagnostics: readonly Diagnostic[];
  /** Maps an emitted line to its AS3 line, or null when generated. Absent means always null. */
  as3LineOf?: (emittedLine: number) => number | null;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function classStatus(diags: readonly Diagnostic[], typeErrorCount: number): ClassStatus {
  if (typeErrorCount > 0 || diags.some((d) => d.kind === 'unsupported-construct')) return 'unsupported';
  if (diags.some((d) => d.kind === 'loose-type')) return 'loose';
  return 'clean';
}

export function buildReport(classes: readonly ReportClassInput[], gate: GateResult | null): TranslationReport {
  const byFile = new Map<string, ReportClassInput>();
  for (const c of classes) byFile.set(`src/${c.className}.ts`, c);

  const perClass = new Map<string, GateError[]>();
  const otherErrors: GateError[] = [];
  for (const e of gate?.errors ?? []) {
    const owner = byFile.get(e.file);
    if (owner === undefined) {
      otherErrors.push(e);
    } else {
      const list = perClass.get(owner.className) ?? [];
      list.push(e);
      perClass.set(owner.className, list);
    }
  }

  const entries: ClassReportEntry[] = classes.map((c) => {
    const diagnostics = c.overridden
      ? []
      : [...c.diagnostics].sort((a, b) => a.line - b.line || cmp(a.kind, b.kind) || cmp(a.message, b.message));
    const typeErrors: TypeErrorEntry[] = (perClass.get(c.className) ?? [])
      .map((e) => ({
        line: e.line,
        column: e.column,
        code: e.code,
        message: e.message,
        as3Line: c.overridden || c.as3LineOf === undefined ? null : c.as3LineOf(e.line),
      }))
      .sort((a, b) => a.line - b.line || a.column - b.column || a.code - b.code || cmp(a.message, b.message));
    return {
      className: c.className,
      status: classStatus(diagnostics, typeErrors.length),
      overridden: c.overridden,
      diagnostics,
      typeErrors,
    };
  });
  entries.sort((a, b) => cmp(a.className, b.className));

  otherErrors.sort(
    (a, b) =>
      cmp(a.file, b.file) || a.line - b.line || a.column - b.column || a.code - b.code || cmp(a.message, b.message),
  );

  return { formatVersion: 1, typeCheck: gate === null ? 'skipped' : 'ran', classes: entries, otherErrors };
}

export function serialiseReport(r: TranslationReport): string {
  return canonicalJson(r, 'translationReport');
}

/** One entry per `unsupported-construct` Diagnostic of every emitted, non-overridden class. */
export function untranslatedCodeEntries(
  classes: readonly TranslatedClass[],
  overridden: ReadonlySet<string>,
): UnsupportedFeatureEntry[] {
  const out: UnsupportedFeatureEntry[] = [];
  for (const c of classes) {
    if (overridden.has(c.className)) continue;
    for (const d of c.diagnostics) {
      if (d.kind !== 'unsupported-construct') continue;
      out.push({ kind: 'untranslated-code', tag: c.className, message: `line ${d.line}: ${d.message}` });
    }
  }
  return out;
}
