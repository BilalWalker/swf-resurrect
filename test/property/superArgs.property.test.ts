import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { build, construct } from '../support/superArgsFixture';

// Property 18: Fields passed to super are the same object.
// **Validates: Requirements 19.1, 19.2, 19.5**

const kinds: Array<[string, string]> = [
  ['Object', '{}'],
  ['Array', '[1, 2]'],
  ['Object', '{ k: 1 }'],
  ['String', '"s"'],
  ['int', '3'],
  ['Number', '1.5'],
  ['Boolean', 'true'],
  ['Object', 'new Object()'],
  ['Array', 'new Array()'],
];

describe('super argument field identity (Property 18)', () => {
  it('constructs and the base received the field itself', () => {
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.boolean(), ([type, init], viaThis) => {
        const r = build(`    public var f:${type} = ${init};`, `      super(${viaThis ? 'this.f' : 'f'});`);
        const { a } = construct(r.text);
        expect(a.got).toBe(a.f);
      }),
      { numRuns: 30 },
    );
  });
});
