// Pure planning step of the Translate stage (design 3). No node:* imports.

import type { SceneJson } from '../../template/runtime/scene';
import { SHIM_AS3_NAMES, SHIM_MOVIECLIP_MEMBERS } from './shimNames';
import { translate } from './translate';
import type { Diagnostic, LineSpan, SyntaxCheck } from './types';

export interface ScriptSource {
  className: string; // file stem
  source: string;
}

export interface TranslatedClass {
  className: string;
  fileName: string; // "<ClassName>.ts"
  text: string;
  diagnostics: Diagnostic[];
  spans: LineSpan[];
  extendsName: string | null;
}

export interface TranslateArtifact {
  classes: TranslatedClass[]; // emitted set only, sorted by className
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Transpiles every source, then keeps the emit closure (Req 4.3). */
export function planTranslate(
  sources: readonly ScriptSource[],
  scene: SceneJson,
  syntaxCheck: SyntaxCheck,
): TranslateArtifact {
  const sorted = [...sources].sort((a, b) => compareCodeUnits(a.className, b.className));
  const siblingClasses: ReadonlySet<string> = new Set(sorted.map((s) => s.className));

  const translated = new Map<string, TranslatedClass>();
  for (const s of sorted) {
    const r = translate(s.source, {
      shimNames: SHIM_AS3_NAMES,
      shimMembers: SHIM_MOVIECLIP_MEMBERS,
      siblingClasses,
      syntaxCheck,
    });
    translated.set(s.className, {
      className: s.className,
      fileName: `${s.className}.ts`,
      text: r.text,
      diagnostics: r.diagnostics,
      spans: r.spans,
      extendsName: r.classes.find((c) => c.name === s.className)?.extendsName ?? r.classes[0]?.extendsName ?? null,
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
    const base = translated.get(queue.pop() as string)?.extendsName;
    if (base != null && translated.has(base) && !emitted.has(base)) {
      emitted.add(base);
      queue.push(base);
    }
  }

  return {
    classes: [...emitted].sort(compareCodeUnits).map((n) => translated.get(n) as TranslatedClass),
  };
}
