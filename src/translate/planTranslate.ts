// Pure planning step of the Translate stage (design 3). No node:* imports.

import type { SceneJson } from '../../template/runtime/scene';
import { qualifiedFromScriptPath } from '../convert/qualifiedName';
import { DuplicateClassError } from './errors';
import { SHIM_AS3_NAMES, SHIM_MOVIECLIP_MEMBERS } from './shimNames';
import { translate } from './translate';
import type { Diagnostic, ImportRecord, LineSpan, SyntaxCheck } from './types';

export type { ImportRecord } from './types';

export interface ScriptSource {
  className: string; // Qualified_Name
  source: string;
}

export interface TranslatedClass {
  className: string;
  fileName: string; // "<ClassName>.ts"
  text: string;
  diagnostics: Diagnostic[];
  spans: LineSpan[];
  /** As written in the source. */
  extendsName: string | null;
  /** Resolved through the import plan; null when the base has no source. */
  extendsQualified: string | null;
  importRecords: ImportRecord[];
}

export interface TranslateArtifact {
  classes: TranslatedClass[]; // emitted set only, sorted by className
  /** Script paths (relative, posix) that give no Qualified_Name; sorted. */
  skippedScripts: string[];
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Keys script paths (relative to the scripts directory, posix separators) by Qualified_Name.
 * A path that gives no Qualified_Name is skipped. Two paths with the same Qualified_Name throw.
 */
export function keyScriptPaths(relPaths: readonly string[]): { keyed: Array<{ qualified: string; path: string }>; skipped: string[] } {
  const byName = new Map<string, string[]>();
  const skipped: string[] = [];
  for (const p of relPaths) {
    const q = qualifiedFromScriptPath(p);
    if (q === null) skipped.push(p);
    else byName.set(q, [...(byName.get(q) ?? []), p]);
  }
  const keyed: Array<{ qualified: string; path: string }> = [];
  for (const [q, ps] of byName) {
    if (ps.length > 1) throw new DuplicateClassError(q, ps);
    keyed.push({ qualified: q, path: ps[0] });
  }
  return { keyed, skipped: skipped.sort(compareCodeUnits) };
}

/** Transpiles every source, then keeps the emit closure (Req 4.3). */
export function planTranslate(
  sources: readonly ScriptSource[],
  scene: SceneJson,
  syntaxCheck: SyntaxCheck,
  skippedScripts: readonly string[] = [],
): TranslateArtifact {
  const sorted = [...sources].sort((a, b) => compareCodeUnits(a.className, b.className));
  const siblingClasses: ReadonlySet<string> = new Set(sorted.map((s) => s.className));

  const translated = new Map<string, TranslatedClass>();
  for (const s of sorted) {
    const dot = s.className.lastIndexOf('.');
    const pathPackage = dot < 0 ? '' : s.className.slice(0, dot);
    const simple = s.className.slice(dot + 1);
    const r = translate(s.source, {
      shimNames: SHIM_AS3_NAMES,
      shimMembers: SHIM_MOVIECLIP_MEMBERS,
      selfQualified: s.className,
      siblingClasses,
      syntaxCheck,
    });
    const info = r.classes.find((c) => c.name === simple) ?? r.classes[0];
    const diagnostics = r.diagnostics;
    if (info !== undefined && (r.packageName !== pathPackage || info.name !== simple)) {
      const declared = r.packageName === '' ? info.name : `${r.packageName}.${info.name}`;
      diagnostics.push({
        kind: 'unsupported-construct',
        line: 1,
        message: `package declaration "${declared}" does not match the path; the path name "${s.className}" is used`,
      });
      diagnostics.sort((a, b) => a.line - b.line || compareCodeUnits(a.kind, b.kind) || compareCodeUnits(a.message, b.message));
    }
    translated.set(s.className, {
      className: s.className,
      fileName: `${s.className}.ts`,
      text: r.text,
      diagnostics,
      spans: r.spans,
      extendsName: info?.extendsName ?? null,
      extendsQualified: info?.extendsQualified ?? null,
      importRecords: r.importRecords,
    });
  }

  const emitted = new Set<string>();
  const queue: string[] = [];
  for (const sym of Object.values(scene.symbols)) {
    const name = (sym as { className?: string }).className;
    if (name !== undefined && translated.has(name) && !emitted.has(name)) {
      emitted.add(name);
      queue.push(name);
    }
  }
  while (queue.length > 0) {
    const cls = translated.get(queue.pop() as string);
    if (cls === undefined) continue;
    const next = [cls.extendsQualified, ...cls.importRecords.map((r) => (r.kind === 'class' ? (r.target ?? null) : null))];
    for (const n of next) {
      if (n != null && translated.has(n) && !emitted.has(n)) {
        emitted.add(n);
        queue.push(n);
      }
    }
  }

  return {
    classes: [...emitted].sort(compareCodeUnits).map((n) => translated.get(n) as TranslatedClass),
    skippedScripts: [...skippedScripts].sort(compareCodeUnits),
  };
}
