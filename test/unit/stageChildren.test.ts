// Stage as a container (as3-coverage task 9.1). Named stageChildren because stageTree.test.ts already tests describeTarget.
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.7
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson } from '../../template/runtime/scene';
import { ArgumentError } from '../../template/shim/errors';
import { Event } from '../../template/shim/events';
import { MovieClip } from '../../template/shim/MovieClip';
import { Sprite } from '../../template/shim/Sprite';
import { FakeBackend } from '../support/fakeBackend';
import { playerOn } from '../support/playerOn';

describe('Stage children', () => {
  it('keeps the root at index 0 and appends script children after it', () => {
    const p = playerOn(new ManualClock());
    const a = new Sprite();
    const b = new Sprite();
    p.stage.addChild(a);
    p.stage.addChild(b);
    expect(p.stage.numChildren).toBe(3);
    expect(p.stage.getChildAt(0)).toBe(p.root);
    expect(p.stage.getChildAt(2)).toBe(b);
    expect(a.parent).toBe(p.stage);
    expect(a.stage).toBe(p.stage);
  });
  it('finds a child by name and throws RangeError for a bad index', () => {
    const p = playerOn(new ManualClock());
    const a = new Sprite();
    a.name = 'hud';
    p.stage.addChild(a);
    expect(p.stage.getChildByName('hud')).toBe(a);
    expect(p.stage.getChildByName('nope')).toBeNull();
    expect(() => p.stage.getChildAt(5)).toThrow(RangeError);
  });
  it('removeChild of a non-child throws ArgumentError and leaves the list alone', () => {
    const p = playerOn(new ManualClock());
    const a = new Sprite();
    p.stage.addChild(a);
    expect(() => p.stage.removeChild(new Sprite())).toThrow(ArgumentError);
    expect(p.stage._children).toEqual([p.root, a]);
  });
  it('dispatches added, addedToStage, removed and removedFromStage', () => {
    const p = playerOn(new ManualClock());
    const a = new Sprite();
    const inner = new Sprite();
    a.addChild(inner);
    const seen: string[] = [];
    for (const t of [Event.ADDED, Event.ADDED_TO_STAGE, Event.REMOVED, Event.REMOVED_FROM_STAGE]) {
      a.addEventListener(t, () => seen.push(`a:${t}`));
      inner.addEventListener(t, () => seen.push(`inner:${t}`));
    }
    p.stage.addChild(a);
    p.stage.removeChild(a);
    expect(seen).toEqual([
      'a:added',
      'a:addedToStage',
      'inner:addedToStage',
      'a:removed',
      'a:removedFromStage',
      'inner:removedFromStage',
    ]);
    expect(a.stage).toBeNull();
  });
  it('moves a child that is added again to the top', () => {
    const p = playerOn(new ManualClock());
    const a = new Sprite();
    const b = new Sprite();
    p.stage.addChild(a);
    p.stage.addChild(b);
    p.stage.addChild(a);
    expect(p.stage._children).toEqual([p.root, b, a]);
  });
  it('keeps the root at index 0: it cannot be added again or removed', () => {
    const p = playerOn(new ManualClock());
    expect(() => p.stage.addChild(p.root)).toThrow(ArgumentError);
    expect(() => p.stage.removeChild(p.root)).toThrow();
    expect(p.stage._children[0]).toBe(p.root);
  });
  it('binds the named children of a linked class added to the Stage before the constructor body', () => {
    class Hud extends MovieClip {
      declare knob: Sprite;
      sawKnob = false;
      constructor() {
        super();
        this.sawKnob = this.knob !== undefined;
      }
    }
    const scene: SceneJson = {
      formatVersion: 2,
      stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
      rootSymbolId: 0,
      symbols: {
        '0': { type: 'sprite', frameCount: 1, frames: [[]], labels: [] },
        '2': { type: 'sprite', frameCount: 1, frames: [[]], labels: [], className: 'Knob' },
        '3': {
          type: 'sprite',
          frameCount: 1,
          className: 'Hud',
          labels: [],
          frames: [[{ depth: 1, symbolId: 2, matrix: [1, 0, 0, 1, 0, 0], colorTransform: [1, 1, 1, 1, 0, 0, 0, 0], name: 'knob' }]],
        },
      },
    };
    const player = new Player({
      scene,
      backend: new FakeBackend(),
      clock: new ManualClock(),
      classRegistry: { Hud, Knob: Sprite },
      shapeBounds: new Map(),
    });
    const hud = new Hud();
    player.stage.addChild(hud);
    expect(hud.sawKnob).toBe(true);
    expect(hud.knob.parent).toBe(hud);
  });
});
