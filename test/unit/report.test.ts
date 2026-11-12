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
