import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { ArgumentError } from '../../template/shim/errors';
import type { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend } from '../support/fakeBackend';
/** A root clip with `frames` empty frames, the given labels and scenes (a generated timeline). */
function rootClip(
  frames: number,
  labels: Array<{ name: string; frame: number }>,
  scenes?: Array<{ name: string; firstFrame: number }>,
): MovieClip {
  const root: SpriteSymbol = {
    type: 'sprite',
    frameCount: frames,
    frames: Array.from({ length: frames }, () => []),
    labels,
  };
  if (scenes !== undefined) root.scenes = scenes;
  const scene: SceneJson = {
    formatVersion: 3,
    stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: { '0': root },
  };
  const player = new Player({
    scene,
    backend: new FakeBackend(),
    clock: new ManualClock(),
    classRegistry: {},
    shapeBounds: new Map(),
  });
  return player.root as MovieClip;
}
describe('MovieClip.currentLabel', () => {
  const labels = [
    { name: 'a', frame: 2 },
    { name: 'b', frame: 5 },
  ];
  it('is null before the first label, the nearest earlier label after it', () => {
    const mc = rootClip(8, labels);
    mc.stop();
    mc.gotoAndStop(1);
    expect(mc.currentLabel).toBeNull();
    mc.gotoAndStop(2);
    expect(mc.currentLabel).toBe('a');
    mc.gotoAndStop(4);
    expect(mc.currentLabel).toBe('a');
    mc.gotoAndStop(5);
    expect(mc.currentLabel).toBe('b');
    mc.gotoAndStop(8);
    expect(mc.currentLabel).toBe('b');
  });
  it('is null when the clip has no labels', () => {
    expect(rootClip(3, []).currentLabel).toBeNull();
  });
});
describe('scenes in MovieClip', () => {
  const scenes = [
    { name: 'S1', firstFrame: 1 },
    { name: 'S2', firstFrame: 4 },
  ];
  it('currentFrame is scene-relative, totalFrames is unchanged', () => {
    const mc = rootClip(6, [{ name: 'x', frame: 5 }], scenes);
    mc.gotoAndStop(2);
    expect(mc.currentFrame).toBe(2);
    mc.gotoAndStop(1, 'S2');
    expect(mc.currentFrame).toBe(1);
    expect(mc.totalFrames).toBe(6);
  });
  it('a number goes relative to the named scene, or to the current one when none is named; a label is global', () => {
    const mc = rootClip(6, [{ name: 'x', frame: 5 }], scenes);
    mc.gotoAndStop(2, 'S2');
    expect(mc.currentFrame).toBe(2);
    mc.gotoAndStop(1);
    expect(mc.currentFrame).toBe(1); // current scene S2: global frame 4
    mc.gotoAndStop('x');
    expect(mc.currentFrame).toBe(2); // global frame 5 is frame 2 of S2
    mc.gotoAndStop(1, 'S1');
    expect(mc.currentFrame).toBe(1);
  });
  it('an unknown scene throws ArgumentError and leaves the clip where it was', () => {
    const mc = rootClip(6, [], scenes);
    mc.gotoAndStop(2);
    expect(() => mc.gotoAndStop(1, 'nope')).toThrow(ArgumentError);
    expect(() => mc.gotoAndPlay(1, 'nope')).toThrow(ArgumentError);
    expect(mc.currentFrame).toBe(2);
  });
  it('one scene at frame 1 keeps the old frame numbers', () => {
    const mc = rootClip(4, []);
    mc.gotoAndStop(3);
    expect(mc.currentFrame).toBe(3);
  });
});
