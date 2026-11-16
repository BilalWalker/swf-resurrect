import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { planReplay, planToEntries } from '../../src/verify/core/replayPlan';
import { fcConfig } from './config';
import { keyInputArb } from './gen/genReferenceInput';

describe('Input_Script key properties', () => {
  // Feature: as3-coverage, Property 24: Input_Script keys round trip and keep order
  // **Validates: Requirements 24.1, 24.6, 24.7, 24.8**
  it('parse, plan and serialise gives an equal entry list; keys take the tick of their group, in order', () => {
    fc.assert(
      fc.property(keyInputArb, (entries) => {
        const p = planReplay(JSON.stringify(entries), null);
        if ('error' in p) throw new Error(p.error);
        expect(p.problems).toEqual([]);
        expect(planToEntries(p)).toEqual(entries);
        // The tick of each key equals the number of Waits before it; plan order equals entry order.
        const expected: Array<[number, number]> = [];
        let tick = 0;
        entries.forEach((e, i) => {
          if (e.type === 'Wait') tick++;
          else expected.push([tick, i]);
        });
        expect(p.keys.map((k) => [k.tick, k.index])).toEqual(expected);
      }),
      fcConfig,
    );
  });
});
