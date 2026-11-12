import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { parseNumFrames, parseTickOptions, planReplay } from '../../src/verify/core/replayPlan';
import { fcConfig } from './config';
import { tickTomlArb } from './gen/genTickToml';
import { referenceInputArb } from './gen/genReferenceInput';

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

  function plan(input: unknown[]) {
    const p = planReplay(JSON.stringify(input), null);
    if ('error' in p) throw new Error(p.error);
    return p;
  }

  // Feature: breadth, Property 14: Input_Groups ignore pointer moves, pointer entries keep their order
  // **Validates: Requirements 14.3, 14.9, 14.11**
  it('Input_Groups count Wait and unsupported entries only; valid pointer entries keep array order', () => {
    fc.assert(
      fc.property(referenceInputArb, (input) => {
        const p = plan(input);
        const breakers = input.filter((e) => e.type === 'Wait' || e.type === 'Unsupported' || e.btn === 'Right').length;
        const lastBreaks =
          input.length > 0 &&
          (input[input.length - 1]!.type === 'Wait' ||
            input[input.length - 1]!.type === 'Unsupported' ||
            input[input.length - 1]!.btn === 'Right');
        expect(p.tickCount).toBe(breakers + (input.length > 0 && !lastBreaks ? 1 : 0));
        const unsupported = p.problems.filter((q) => q.kind === 'unsupported-input').map((q) => q.index);
        const expectUnsupported = input.flatMap((e, i) => (e.type === 'Unsupported' || e.btn === 'Right' ? [i] : []));
        expect(unsupported).toEqual(expectUnsupported);
        const validIdx = input.flatMap((e, i) => (e.type.startsWith('Mouse') && e.btn !== 'Right' ? [i] : []));
        expect(p.pointers.map((q) => q.index)).toEqual(validIdx);
        const ticks = p.pointers.map((q) => q.tick);
        expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
      }),
      fcConfig,
    );
  });

  // Feature: breadth, Property 15: Unpaired presses and releases are flagged and still delivered
  // **Validates: Requirements 14.9, 14.3**
  it('flags exactly the MouseUp with the button up and the MouseDown with the button down', () => {
    fc.assert(
      fc.property(referenceInputArb, (input) => {
        const p = plan(input);
        let down = false;
        const flagged: number[] = [];
        let pairs = 0;
        input.forEach((e, i) => {
          if (e.type === 'MouseDown' && e.btn === 'Left') {
            if (down) flagged.push(i);
            down = true;
          } else if (e.type === 'MouseUp') {
            if (!down) flagged.push(i);
            else pairs++;
            down = false;
          }
        });
        expect(p.problems.filter((q) => q.kind === 'unpaired-mouse-event').map((q) => q.index)).toEqual(flagged);
        expect(p.pointers.filter((q) => q.unpaired).map((q) => q.index)).toEqual(flagged);
        for (const q of p.pointers) {
          const e = input[q.index]!;
          expect(q.kind).toBe(e.type === 'MouseDown' ? 'down' : e.type === 'MouseUp' ? 'up' : 'move');
        }
        expect(p.pressReleasePairs).toBe(pairs);
      }),
      fcConfig,
    );
  });});
