import { describe, expect, it } from 'vitest';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import {
  buildReport,
  classStatus,
  serialiseReport,
  untranslatedCodeEntries,
  type ReportClassInput,
} from '../../src/translate/report';
import type { GateError } from '../../src/translate/typeCheckGate';
import { gateError } from '../support/gateError';
import type { Diagnostic } from '../../src/translate/types';
import type { ClassOmission } from '../../src/emit/classOmissions';

const loose: Diagnostic = { kind: 'loose-type', line: 3, message: 'declaration has no usable type; emitted as any' };
const unsup: Diagnostic = { kind: 'unsupported-construct', line: 7, message: "statement kind 'try' is not supported" };
const err = (file: string, line: number): GateError => gateError({ file, line });

describe('classStatus', () => {
  it('follows the truth table', () => {
    expect(classStatus([], 0)).toBe('clean');
    expect(classStatus([loose], 0)).toBe('loose');
    expect(classStatus([unsup], 0)).toBe('unsupported');
    expect(classStatus([loose, unsup], 0)).toBe('unsupported');
    expect(classStatus([], 1)).toBe('unsupported');
    expect(classStatus([loose], 2)).toBe('unsupported');
  });
});

describe('buildReport', () => {
  const classes: ReportClassInput[] = [
    { className: 'B', overridden: false, diagnostics: [loose] },
    { className: 'A', overridden: false, diagnostics: [] },
    { className: 'C', overridden: true, diagnostics: [unsup] },
  ];

  it('raises status on type errors, sorts classes and clears overridden diagnostics', () => {
    const r = buildReport(classes, { errors: [err('src/A.ts', 5), err('src/C.ts', 1)] });
    expect(r.typeCheck).toBe('ran');
    expect(r.classes.map((c) => [c.className, c.status])).toEqual([
      ['A', 'unsupported'],
      ['B', 'loose'],
      ['C', 'unsupported'],
    ]);
    expect(r.classes[2]?.diagnostics).toEqual([]);
    expect(r.classes[0]?.typeErrors[0]?.as3Line).toBeNull();
  });

  it('carries syntactic and specifier on otherErrors entries only', () => {
    const e = gateError({ file: 'src/Other.ts', code: 2307, specifier: './Nope', syntactic: false });
    const s = gateError({ file: 'src/Other.ts', line: 2, code: 1005, syntactic: true });
    const r = buildReport(classes, { errors: [e, s, err('src/A.ts', 5)] });
    expect(r.otherErrors).toEqual([e, s]);
    expect(Object.keys(r.classes.find((c) => c.className === 'A')!.typeErrors[0]).sort()).toEqual([
      'as3Line',
      'code',
      'column',
      'line',
      'message',
    ]);
  });

  it('puts errors in non-class files in otherErrors', () => {
    const r = buildReport(classes, { errors: [err('runtime/x.ts', 2), err('src/Unknown.ts', 1)] });
    expect(r.otherErrors.map((e) => e.file)).toEqual(['runtime/x.ts', 'src/Unknown.ts']);
    expect(r.classes.every((c) => c.typeErrors.length === 0)).toBe(true);
  });

  it('reports skipped when no gate result exists', () => {
    expect(buildReport(classes, null).typeCheck).toBe('skipped');
  });

  it('serialises byte-identically regardless of input order', () => {
    const gate = { errors: [err('src/A.ts', 5), err('runtime/x.ts', 2)] };
    const a = serialiseReport(buildReport(classes, gate));
    const b = serialiseReport(buildReport([...classes].reverse(), { errors: [...gate.errors].reverse() }));
    expect(a).toBe(b);
    expect(a.endsWith('}\n')).toBe(true);
  });
});

describe('untranslatedCodeEntries', () => {
  const mk = (className: string, diagnostics: Diagnostic[]): TranslatedClass => ({
    className,
    fileName: `${className}.ts`,
    text: '',
    diagnostics,
    spans: [],
    extendsName: null,
  extendsQualified: null,
  importRecords: [],
  });

  it('records an as3-interface Named_Limit for an AS3 interface, next to its untranslated-code entry', () => {
    const entries = untranslatedCodeEntries([{ ...mk('p.IThing', [unsup]), as3Interface: true }, mk('p.C', [])], new Set());
    expect(entries.map((e) => [e.kind, e.tag])).toEqual([
      ['as3-interface', 'p.IThing'],
      ['untranslated-code', 'p.IThing'],
    ]);
    expect(entries[0]!.message).toContain('AS3 interface p.IThing');
  });

  it('emits one entry per unsupported-construct Diagnostic and skips overridden classes', () => {
    const entries = untranslatedCodeEntries(
      [mk('A', [loose, unsup, { ...unsup, line: 9 }]), mk('B', [unsup])],
      new Set(['B']),
    );
    expect(entries).toEqual([
      { kind: 'untranslated-code', tag: 'A', message: "line 7: statement kind 'try' is not supported" },
      { kind: 'untranslated-code', tag: 'A', message: "line 9: statement kind 'try' is not supported" },
    ]);
  });
});

describe('buildReport: omitted and loose classes (spec task 4.5)', () => {
  const omission: ClassOmission = {
    className: 'B',
    reason: { kind: 'unresolved-import', specifier: './Nope', line: 3 },
    symbolIds: [2],
  };
  const classes: ReportClassInput[] = [
    { className: 'B', overridden: false, diagnostics: [] },
    { className: 'A', overridden: false, diagnostics: [] },
  ];

  it('lists omittedClasses and marks classes[].omitted with a class-omitted Diagnostic', () => {
    const r = buildReport(classes, { errors: [] }, { omissions: [omission] });
    expect(r.omittedClasses).toEqual([omission]);
    expect(r.classes.map((c) => [c.className, c.omitted])).toEqual([
      ['A', false],
      ['B', true],
    ]);
    const d = r.classes[1]!.diagnostics;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: 'class-omitted', line: 3 });
    expect(d[0]!.message).toContain('./Nope');
  });

  it('carries the reason and the missing import name in omittedClasses and in the Diagnostic', () => {
    const missing: ClassOmission = {
      className: 'B',
      reason: { kind: 'missing-export', name: 'IThing', target: 'p.IThing', line: 4 },
      symbolIds: [],
    };
    const r = buildReport(classes, { errors: [] }, { omissions: [missing] });
    expect(r.omittedClasses[0]!.reason).toEqual({ kind: 'missing-export', name: 'IThing', target: 'p.IThing', line: 4 });
    const d = r.classes[1]!.diagnostics[0]!;
    expect(d).toMatchObject({ kind: 'class-omitted', line: 4 });
    expect(d.message).toContain('IThing');
    expect(d.message).toContain('p.IThing');
  });

  it('sets loose for a class with only type errors and leaves status alone', () => {
    const gate = { errors: [err('src/A.ts', 5)] };
    const r = buildReport(
      classes,
      gate,
      { loose: [{ className: 'A', count: 1, firstLine: 5, firstMessage: 'm' }] },
    );
    const a = r.classes.find((c) => c.className === 'A')!;
    expect(a.loose).toBe(true);
    expect(a.omitted).toBe(false);
    expect(a.status).toBe('unsupported'); // classStatus is unchanged: one type error
    expect(a.typeErrors).toHaveLength(1);
    expect(r.classes.find((c) => c.className === 'B')!.loose).toBe(false);
    expect(r.omittedClasses).toEqual([]);
  });
});
describe('buildReport: classPaths (spec task 5.8)', () => {
  it('lists classPaths sorted by className and maps type errors by the chosen path', () => {
    const classes: ReportClassInput[] = [
      { className: 'Main', overridden: false, path: 'src/Main.class.ts', diagnostics: [] },
      { className: 'a.B', overridden: false, path: 'src/a/B.ts', diagnostics: [] },
    ];
    const r = buildReport(
      classes,
      { errors: [err('src/Main.class.ts', 4), err('src/Main.ts', 1)] },
      {
        classPaths: [
          { className: 'a.B', originalPath: 'src/a/B.ts', path: 'src/a/B.ts' },
          { className: 'Main', originalPath: 'src/Main.ts', path: 'src/Main.class.ts' },
        ],
      },
    );
    expect(r.classPaths.map((p) => p.className)).toEqual(['Main', 'a.B']);
    expect(r.classPaths[0]).toEqual({ className: 'Main', originalPath: 'src/Main.ts', path: 'src/Main.class.ts' });
    expect(r.classes.find((c) => c.className === 'Main')!.typeErrors).toHaveLength(1);
    expect(r.otherErrors.map((e) => e.file)).toEqual(['src/Main.ts']);
    expect(buildReport([], null).classPaths).toEqual([]);
  });
});
