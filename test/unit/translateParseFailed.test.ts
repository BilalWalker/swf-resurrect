// Task 12.3: the D5 fallback carries a structural marker; normal output does not.
import { describe, expect, it } from 'vitest';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translate } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

const opts = (syntaxCheck: typeof tsSyntaxCheck) => ({
  shimNames: SHIM_AS3_NAMES,
  selfQualified: 'p.C',
  siblingClasses: new Set(['p.C']) as never,
  syntaxCheck,
});
const SRC = 'package p { public class C { public var x:int; } }';

describe('parseFailed marker', () => {
  it('is set by the D5 fallback', () => {
    const r = translate(SRC, opts(() => [{ line: 1, message: 'Invalid character.' }] as never));
    expect(r.parseFailed).toBe(true);
    expect(r.text.startsWith('// AS3: ')).toBe(true);
  });

  it('is absent on normal output', () => {
    const r = translate(SRC, opts(tsSyntaxCheck));
    expect('parseFailed' in r).toBe(false);
  });
});
