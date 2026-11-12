import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { parseNumFrames, parseTickOptions, planReplay } from '../../src/verify/core/replayPlan';
import { fcConfig } from './config';
import { tickTomlArb } from './gen/genTickToml';

describe('Replay plan properties', () => {
  // Feature: breadth, Property 16: Tick options follow Ruffle's rule
  // **Validates: Requirements 14.12, 14.13, 14.14**
  it('parseTickOptions and tickCount follow num_frames, then num_ticks, then the Input_Group count', () => {
    fc.assert(
      fc.property(tickTomlArb, fc.integer({ min: 0, max: 6 }), (toml, extraWaits) => {
        const opts = parseTickOptions(toml.text);
        expect(opts.numFrames).toBe(toml.numFrames);
        expect(opts.numTicks).toBe(toml.numTicks);
        expect(opts.tickRate !== null).toBe(toml.tickRate !== null);
        const expected = toml.numFrames ?? toml.numTicks;
        expect(parseNumFrames(toml.text)).toBe(expected);

        // `extraWaits` Waits make `extraWaits` Input_Groups (the last Wait ends a group, no open group follows).
        const input = JSON.stringify(Array.from({ length: extraWaits }, () => ({ type: 'Wait' })));
        const source = toml.numFrames !== null ? 'num_frames' : 'num_ticks';
        const plan = planReplay(input, parseNumFrames(toml.text), source);
        if ('error' in plan) throw new Error(plan.error);
        if (expected === null) {
          expect(plan.tickCount).toBe(extraWaits);
          expect(plan.tickSource).toBe('input-groups');
          expect(plan.problems).toEqual([]);
        } else {
          expect(plan.tickCount).toBe(expected);
          expect(plan.tickSource).toBe(source);
          const surplus = plan.problems.filter((p) => p.kind === 'unused-input');
          expect(surplus.length).toBe(extraWaits > expected ? 1 : 0);
          if (extraWaits > expected) expect(surplus[0]!.index).toBe(expected);
        }
      }),
      fcConfig,
    );
  });
});
