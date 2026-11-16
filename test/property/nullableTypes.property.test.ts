import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import type { TranslateOptions } from '../../src/translate/types';
import { fcConfig } from './config';

const options: TranslateOptions = {
  shimNames: SHIM_AS3_NAMES,
  selfQualified: 'A',
  siblingClasses: new Set(['A', 'Foo', 'IFoo']),
  syntaxCheck: tsSyntaxCheck,
};

// AS3 type -> whether the emitted type must admit null. `Object` and `*` become `any`, which admits null.
const PRIMITIVES = ['int', 'uint', 'Number', 'Boolean'];
const REFERENCES = ['Foo', 'IFoo', 'String', 'Array', 'Function', 'Vector.<Foo>', 'Vector.<int>', 'Object'];
const genType = fc.oneof(
  fc.constantFrom(...PRIMITIVES).map((type) => ({ type, reference: false })),
  fc.constantFrom(...REFERENCES).map((type) => ({ type, reference: true })),
);
const genPosition = fc.constantFrom('field', 'param', 'local', 'return');

function annotationOf(position: string, type: string): string {
  const body: Record<string, string> = {
    field: `    public var x:${type};`,
    param: `    public function m(x:${type}):void\n    {\n    }`,
    local: `    public function m():void\n    {\n      var x:${type};\n    }`,
    return: `    public function m():${type}\n    {\n      return null;\n    }`,
  };
  const text = translateCore(`package\n{\n  public class A\n  {\n${body[position]}\n  }\n}\n`, options).text;
  const line = text.split('\n').find((l) => (position === 'return' ? /m\(\)/.test(l) : /\bx\b/.test(l))) ?? '';
  const m =
    position === 'return' ? /m\(\): (.*) \{$/.exec(line.trim()) : /\bx: ([^=;)]*?)\s*(?:=.*|;|\)[^)]*)?$/.exec(line.trim());
  return m?.[1].trim() ?? `<missing: ${line}>`;
}

// Feature: as3-coverage, Property 2: Null admission follows the type kind
describe('Property 2: Null admission follows the type kind', () => {
  /** **Validates: Requirements 3.1, 3.2, 3.5** */
  it('the emitted type admits null if and only if the AS3 type is a reference type', () => {
    fc.assert(
      fc.property(genType, genPosition, ({ type, reference }, position) => {
        const text = annotationOf(position, type);
        // `Object` is emitted as `any`, which admits null without a suffix.
        const admits = text.endsWith('| null') || text === 'any';
        expect(admits, `${position} ${type} -> ${text}`).toBe(reference);
      }),
      fcConfig,
    );
  });
});
