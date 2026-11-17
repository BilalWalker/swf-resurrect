import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ArgumentError } from '../../template/shim/errors';
import { resolveGotoTarget, sceneRelativeFrame } from '../../template/shim/timelineLookup';
import { fcConfig } from './config';
// Feature: as3-coverage, Property 20: Scene goto and scene round trip (goto half)
describe('Property 20: scene goto', () => {
  const timelines = fc
    .uniqueArray(fc.integer({ min: 2, max: 50 }), { maxLength: 5 })
    .chain((rest) =>
      fc.integer({ min: 50, max: 60 }).map((total) => ({
        total,
        scenes: [1, ...rest.sort((a, b) => a - b)].map((firstFrame, i) => ({ name: `S${i}`, firstFrame })),
      })),
    );
  it('in-range gotoAndStop(frame, scene) lands on firstFrame + frame - 1', () => {
    fc.assert(
      fc.property(timelines, fc.nat(), fc.nat(), fc.nat(), ({ total, scenes }, si, fr, cur) => {
        const i = si % scenes.length;
        const end = i + 1 < scenes.length ? scenes[i + 1].firstFrame - 1 : total;
        const len = end - scenes[i].firstFrame + 1;
        const frame = (fr % len) + 1;
        const current = (cur % total) + 1;
        expect(resolveGotoTarget(frame, scenes[i].name, scenes, [], current, total)).toBe(scenes[i].firstFrame + frame - 1);
      }),
      fcConfig,
    );
  });
  it('a number without a scene is relative to the current scene', () => {
    fc.assert(
      fc.property(timelines, fc.nat(), ({ total, scenes }, cur) => {
        const current = (cur % total) + 1;
        const rel = sceneRelativeFrame(scenes, current);
        // going to the current relative frame stays on the current global frame
        expect(resolveGotoTarget(rel, undefined, scenes, [], current, total)).toBe(current);
      }),
      fcConfig,
    );
  });
  it('an unknown scene throws ArgumentError', () => {
    fc.assert(
      fc.property(timelines, fc.integer({ min: 1, max: 10 }), ({ total, scenes }, frame) => {
        expect(() => resolveGotoTarget(frame, 'no such scene', scenes, [], 1, total)).toThrow(ArgumentError);
      }),
      fcConfig,
    );
  });
});
