import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Event } from '../../template/shim/events';
import { Sprite } from '../../template/shim/Sprite';
import { playerOn } from '../support/playerOn';
import { fcConfig } from './config';

// Feature: as3-coverage, Property 7: Broadcast events follow registration order
// **Validates: Requirements 7.5, 7.8, 7.9**
const TYPES = [Event.ENTER_FRAME, Event.FRAME_CONSTRUCTED, Event.EXIT_FRAME] as const;

describe('Property 7: Broadcast events follow registration order', () => {
  it('delivers each event once per frame step to each listener, in the order of first registration', () => {
    fc.assert(
      fc.property(
        // For each object: its parent (index into earlier objects, or -1 for the root, -2 for the Stage, -3 for none).
        fc.array(fc.integer({ min: -3, max: 6 }), { minLength: 1, maxLength: 8 }),
        fc.array(fc.nat(), { minLength: 1, maxLength: 12 }),
        fc.constantFrom(...TYPES),
        fc.integer({ min: 1, max: 3 }),
        (parents, order, type, steps) => {
          const clock = new ManualClock();
          const p = playerOn(clock);
          const objs: Array<Sprite | typeof p.stage> = [p.stage];
          for (let i = 0; i < parents.length; i++) {
            const s = new Sprite();
            const at = parents[i]!;
            if (at === -1) p.root.addChild(s);
            else if (at === -2) p.stage.addChild(s);
            else if (at >= 0 && at < i) (objs[at + 1] instanceof Sprite ? (objs[at + 1] as Sprite) : p.root).addChild(s);
            objs.push(s);
          }
          const seen: number[] = [];
          const registered: number[] = [];
          const listeners = new Map<number, () => void>();
          for (const k of order) {
            const idx = k % objs.length;
            if (!registered.includes(idx)) registered.push(idx);
            // One listener per object, so a repeat registration is ignored, as in Flash.
            if (!listeners.has(idx)) listeners.set(idx, () => void seen.push(idx));
            objs[idx]!.addEventListener(type, listeners.get(idx)!);
          }
          for (let i = 0; i < steps; i++) {
            clock.advance(100);
            p.update();
          }
          const expected: number[] = [];
          for (let i = 0; i < steps; i++) expected.push(...registered);
          expect(seen).toEqual(expected);
        },
      ),
      fcConfig,
    );
  });
});
