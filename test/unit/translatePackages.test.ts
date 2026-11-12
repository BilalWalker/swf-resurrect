import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { DuplicateClassError } from '../../src/translate/errors';
import { keyScriptPaths, planTranslate } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

const scene = (names: string[]): SceneJson => {
  const symbols: Record<string, unknown> = {};
  names.forEach((c, i) => {
    symbols[String(i)] = { type: 'sprite', frames: [], labels: {}, className: c };
  });
  return { formatVersion: 1, rootSymbolId: 0, symbols } as unknown as SceneJson;
};

const cls = (pkg: string, name: string, base?: string) =>
  `package ${pkg} {\n  public class ${name}${base ? ` extends ${base}` : ''} {\n  }\n}\n`;

describe('keyScriptPaths', () => {
  it('does not treat the same simple name in two packages as a duplicate', () => {
    const r = keyScriptPaths(['a/X.as', 'b/X.as', 'X.as']);
    expect(r.keyed.map((k) => k.qualified).sort()).toEqual(['X', 'a.X', 'b.X']);
  });

  it('throws DuplicateClassError for equal Qualified_Names', () => {
    const err = (() => {
      try {
        keyScriptPaths(['a/X.as', 'a/X.as']);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DuplicateClassError);
    expect((err as DuplicateClassError).className).toBe('a.X');
  });

  it('skips paths without a Qualified_Name, sorted', () => {
    const r = keyScriptPaths(['z.y.as', 'A.as', 'a.b/C.as', 'notes.txt']);
    expect(r.keyed.map((k) => k.qualified)).toEqual(['A']);
    expect(r.skipped).toEqual(['a.b/C.as', 'notes.txt', 'z.y.as']);
  });
});

describe('planTranslate with Qualified_Names', () => {
  it('keeps two classes with the same simple name', () => {
    const r = planTranslate(
      [
        { className: 'a.X', source: cls('a', 'X') },
        { className: 'b.X', source: cls('b', 'X') },
      ],
      scene(['a.X', 'b.X']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['a.X', 'b.X']);
    expect(r.classes.every((c) => c.diagnostics.length === 0)).toBe(true);
  });

  it('reports a package declaration that differs from the path', () => {
    const r = planTranslate([{ className: 'a.X', source: cls('b', 'X') }], scene(['a.X']), tsSyntaxCheck);
    expect(r.classes[0].diagnostics).toEqual([
      {
        kind: 'unsupported-construct',
        line: 1,
        message: 'package declaration "b.X" does not match the path; the path name "a.X" is used',
      },
    ]);
    expect(r.classes[0].className).toBe('a.X');
  });

  it('reports a class name that differs from the path', () => {
    const r = planTranslate([{ className: 'a.X', source: cls('a', 'Y') }], scene(['a.X']), tsSyntaxCheck);
    expect(r.classes[0].diagnostics.map((d) => d.message)).toEqual([
      'package declaration "a.Y" does not match the path; the path name "a.X" is used',
    ]);
  });

  it('adds no Diagnostic when declaration and path agree', () => {
    const r = planTranslate([{ className: 'X', source: cls('', 'X') }], scene(['X']), tsSyntaxCheck);
    expect(r.classes[0].diagnostics).toEqual([]);
  });

  it('carries skipped scripts sorted', () => {
    const r = planTranslate([], scene([]), tsSyntaxCheck, ['b.as', 'a.as']);
    expect(r.skippedScripts).toEqual(['a.as', 'b.as']);
  });
});
