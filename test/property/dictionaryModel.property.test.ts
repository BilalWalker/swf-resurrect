// Feature: as3-coverage, Property 14: Dictionary agrees with an identity model
// Validates: Requirements 13.1, 13.3, 13.5
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { Dictionary } from '../../template/shim/Dictionary';
import { fcConfig } from './config';

const fnPool = [(): number => 1, (): number => 1, (): number => 2];
const objPool = [{}, {}, { a: 1 }];
// Keys: functions and objects by identity, strings and numbers by value (no -0: Map folds it into +0).
const keyArb = fc.oneof(
  fc.constantFrom(...fnPool),
  fc.constantFrom(...objPool),
  fc.constantFrom('a', 'b', '1'),
  fc.constantFrom(1, 2, 0, NaN),
);
type Op = { op: 'set'; key: unknown; value: number } | { op: 'get' | 'has' | 'delete'; key: unknown };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ op: fc.constant('set' as const), key: keyArb, value: fc.integer() }),
  fc.record({ op: fc.constantFrom('get' as const, 'has' as const, 'delete' as const), key: keyArb }),
);

describe('Property 14: Dictionary agrees with an identity model', () => {
  it('matches a list of pairs compared by Object.is', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
        const d = new Dictionary();
        const model: Array<[unknown, number]> = [];
        const find = (k: unknown): number => model.findIndex(([mk]) => Object.is(mk, k));
        for (const o of ops) {
          const i = find(o.key);
          if (o.op === 'set') {
            d.set(o.key, o.value);
            if (i >= 0) model[i] = [o.key, o.value];
            else model.push([o.key, o.value]);
          } else if (o.op === 'get') {
            if (d.get(o.key) !== (i >= 0 ? model[i]![1] : undefined)) return false;
          } else if (o.op === 'has') {
            if (d.has(o.key) !== (i >= 0)) return false;
          } else {
            if (d.delete(o.key) !== (i >= 0)) return false;
            if (i >= 0) model.splice(i, 1);
          }
        }
        return true;
      }),
      fcConfig,
    );
  });
});
