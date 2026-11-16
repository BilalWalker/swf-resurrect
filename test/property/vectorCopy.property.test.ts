import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import type { TranslateOptions } from '../../src/translate/types';
import { evalTranslated } from '../support/evalTranslated';
import { fcConfig } from './config';

const options: TranslateOptions = {
  shimNames: SHIM_AS3_NAMES,
  selfQualified: 'A',
  siblingClasses: new Set(['A', 'Foo']),
  syntaxCheck: tsSyntaxCheck,
};

/** The emitted function for `Vector.<T>(x)`, evaluated. */
function copier(elementType: string): (x: unknown[]) => unknown[] {
  const text = translateCore(
    `package\n{\n  public class A\n  {\n    public function m(x:*):*\n    {\n      return Vector.<${elementType}>(x);\n    }\n  }\n}\n`,
    options,
  ).text;
  expect(text).not.toContain('// AS3:');
  const A = evalTranslated(text).A;
  return (x) => new A().m(x);
}

// Feature: as3-coverage, Property 11: Vector conversion copies
describe('Property 11: Vector conversion copies', () => {
  /** **Validates: Requirements 10.1, 10.2, 10.4** */
  it('a non-integer element type gives a different array with the same length and elements', () => {
    fc.assert(
      fc.property(fc.constantFrom('String', 'Number', 'Foo', 'Object'), fc.array(fc.anything()), (t, x) => {
        const y = copier(t)(x);
        expect(y).not.toBe(x);
        expect(y).toHaveLength(x.length);
        y.forEach((e, i) => expect(Object.is(e, x[i])).toBe(true));
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 10.2, 10.4** */
  it('int and uint coerce every element with the int and uint conversion', () => {
    fc.assert(
      fc.property(fc.constantFrom('int', 'uint'), fc.array(fc.oneof(fc.integer(), fc.double({ noNaN: true }), fc.constant(-1))), (t, x) => {
        const y = copier(t)(x);
        expect(y).not.toBe(x);
        expect(y).toEqual(x.map((v) => (t === 'int' ? v | 0 : v >>> 0)));
      }),
      fcConfig,
    );
  });
});
