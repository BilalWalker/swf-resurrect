import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { parseNumFrames, parseTickOptions, planReplay } from '../../src/verify/core/replayPlan';
import { decideBehaviour } from '../../src/verify/core/replayOutcome';
import { splitTraceLines } from '../../src/verify/core/traceFormat';
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


// Feature: breadth, Property 40: Empty-input Replay and an empty Reference_Trace
describe('Property 40: Empty-input Replay and an empty Reference_Trace', () => {
  // **Validates: Requirements 14.12, 14.23, 14.24, 1.9, 1.10, 1.11**
  it('the empty input plans num_frames else num_ticks ticks with no pointers, groups or problems', () => {
    fc.assert(
      fc.property(fc.option(fc.nat(500), { nil: null }), fc.nat(500), (frames, ticks) => {
        const toml = (frames === null ? '' : `num_frames = ${frames}\n`) + `num_ticks = ${ticks}\n`;
        const n = parseNumFrames(toml);
        expect(n).toBe(frames ?? ticks);
        const p = planReplay('[]', n, frames !== null ? 'num_frames' : 'num_ticks');
        if ('error' in p) throw new Error(p.error);
        expect(p.tickCount).toBe(frames ?? ticks);
        expect(p.pointers).toEqual([]);
        expect(p.pressReleasePairs).toBe(0);
        expect(p.problems).toEqual([]);
        const groups = planReplay('[]', null);
        if ('error' in groups) throw new Error(groups.error);
        expect(groups.tickCount).toBe(0);
      }),
      fcConfig,
    );
  });

  const obsArb = fc.record({
    lines: fc.array(fc.string(), { maxLength: 5 }),
    ticksRun: fc.nat(50),
    error: fc.option(fc.record({ tick: fc.nat(50), message: fc.string() }), { nil: null }),
    childFailure: fc.boolean(),
  });
  // splitTraceLines gives zero lines only for the empty text; see the 7.9 note on line-break-only files.
  const emptyTextArb = fc.string({ maxLength: 3 }).filter((s) => splitTraceLines(s).length === 0);
  const lineBreakArb = fc.array(fc.constantFrom('\n', '\r\n', '\r'), { maxLength: 6 }).map((a) => a.join(''));

  it('a trace with no lines is empty-reference-trace, unscored, with a replay-error exactly when the observation has an error', () => {
    fc.assert(
      fc.property(emptyTextArb, fc.option(obsArb, { nil: null }), (text, obs) => {
        expect(splitTraceLines(text)).toHaveLength(0);
        const d = decideBehaviour(splitTraceLines(text), obs);
        expect(d).toMatchObject({ status: 'not-compared', reason: 'empty-reference-trace' });
        expect('comparison' in d).toBe(false);
        const hasError = obs !== null && obs.error !== null;
        expect(d.problem !== null && d.problem.kind === 'replay-error').toBe(hasError);
      }),
      fcConfig,
    );
  });

  it('a trace with at least one line is never empty-reference-trace', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }).filter((s) => /[^\r\n]/.test(s)), lineBreakArb, obsArb, (s, tail, obs) => {
        const lines = splitTraceLines(s + tail);
        fc.pre(lines.length > 0);
        const d = decideBehaviour(lines, obs);
        expect(d.status === 'not-compared' && d.reason === 'empty-reference-trace').toBe(false);
      }),
      fcConfig,
    );
  });
});