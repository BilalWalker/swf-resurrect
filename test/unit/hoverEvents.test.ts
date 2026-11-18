// Hover and roll events of the Player (robustness task 22.1). Validates: Requirements 20.5, 20.6, 20.10, 20.20
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson } from '../../template/runtime/scene';
import type { DisplayObject } from '../../template/shim/DisplayObject';
import { Event, MouseEvent } from '../../template/shim/events';
import { FakeBackend } from '../support/fakeBackend';

const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
function entry(depth: number, symbolId: number, tx = 0): DisplayListEntry {
  return { depth, symbolId, matrix: [1, 0, 0, 1, tx, 0], colorTransform: ID_CT, name: '' };
}
const sprite = (list: DisplayListEntry[]): SceneJson['symbols'][string] => ({ type: 'sprite', frameCount: 1, frames: [list], labels: [] });

/**
 * root: A at x 0 (a 40 x 30 shape plus its child B at x 50) and C at x 200. A point at x 10 is in A, x 60 in B (inside A),
 * x 210 in C, x 120 in nothing (the Stage_Object).
 */
function build() {
  const scene: SceneJson = {
    formatVersion: 3,
    stage: { width: 300, height: 300, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      '0': sprite([entry(1, 2), entry(2, 4, 200)]),
      '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 40, height: 30 } },
      '2': sprite([entry(1, 1), entry(2, 3, 50)]),
      '3': sprite([entry(1, 1)]),
      '4': sprite([entry(1, 1)]),
    },
  };
  const player = new Player({
    scene,
    backend: new FakeBackend(),
    clock: new ManualClock(),
    classRegistry: {},
    shapeBounds: new Map([[1, { x: 0, y: 0, width: 40, height: 30 }]]),
  });
  const A = player.root.getChildAt(0) as DisplayObject;
  const C = player.root.getChildAt(1) as DisplayObject;
  const B = (A as unknown as { getChildAt(i: number): DisplayObject }).getChildAt(1);
  const names = new Map<unknown, string>([[A, 'A'], [B, 'B'], [C, 'C']]);
  const log: string[] = [];
  const types = [MouseEvent.MOUSE_OVER, MouseEvent.MOUSE_OUT, MouseEvent.ROLL_OVER, MouseEvent.ROLL_OUT, MouseEvent.MOUSE_MOVE, MouseEvent.MOUSE_UP, MouseEvent.CLICK, 'releaseOutside'];
  for (const [o, name] of names) {
    for (const t of types) {
      (o as DisplayObject).addEventListener(t, (e: Event) => {
        log.push(`${name}:${e.type}:${e.eventPhase === 2 ? 'target' : 'bubble'}`);
      });
    }
  }
  const take = (): string[] => log.splice(0, log.length);
  return { player, take };
}

describe('hover events (FakeBackend, manual clock)', () => {
  it('the four constants exist and only mouseOver and mouseOut bubble by default', () => {
    expect(MouseEvent.MOUSE_OVER).toBe('mouseOver');
    expect(MouseEvent.MOUSE_OUT).toBe('mouseOut');
    expect(MouseEvent.ROLL_OVER).toBe('rollOver');
    expect(MouseEvent.ROLL_OUT).toBe('rollOut');
    expect(new MouseEvent(MouseEvent.MOUSE_OVER).bubbles).toBe(true);
    expect(new MouseEvent(MouseEvent.MOUSE_OUT).bubbles).toBe(true);
    expect(new MouseEvent(MouseEvent.ROLL_OVER).bubbles).toBe(false);
    expect(new MouseEvent(MouseEvent.ROLL_OUT).bubbles).toBe(false);
  });

  it('roll events come before mouseOver, and both before mouseMove', () => {
    const { player, take } = build();
    player.dispatchMouseMove(10, 10);
    expect(take()).toEqual(['A:rollOver:target', 'A:mouseOver:target', 'A:mouseMove:target']);
  });

  it('moving between two objects fires out then over, rollOut and rollOver once per object of the chain, mouseOver and mouseOut bubbling', () => {
    const { player, take } = build();
    player.dispatchMouseMove(210, 10);
    take();
    player.dispatchMouseMove(60, 10); // C to B (B is inside A)
    expect(take()).toEqual([
      'C:mouseOut:target',
      'C:rollOut:target',
      // Each object of the chain below the common ancestor (the root) is the target of its own non-bubbling rollOver.
      'B:rollOver:target',
      'A:rollOver:target',
      'B:mouseOver:target',
      'A:mouseOver:bubble',
      'B:mouseMove:target',
      'A:mouseMove:bubble',
    ]);
  });

  it('leaving a child for its parent: mouseOut bubbles, rollOut stops below the common ancestor', () => {
    const { player, take } = build();
    player.dispatchMouseMove(60, 10);
    take();
    player.dispatchMouseMove(10, 10); // B to A
    expect(take()).toEqual([
      'B:mouseOut:target',
      'A:mouseOut:bubble',
      'B:rollOut:target', // A is the common ancestor, so it gets no rollOut
      'A:mouseOver:target',
      'A:mouseMove:target',
    ]);
  });

  it('fires nothing when the target is unchanged, and leaving to the Stage_Object fires out events only', () => {
    const { player, take } = build();
    player.dispatchMouseMove(10, 10);
    take();
    player.dispatchMouseMove(12, 12);
    expect(take()).toEqual(['A:mouseMove:target']);
    player.dispatchMouseMove(12, 12);
    expect(take()).toEqual([]);
    const rootRolls: string[] = [];
    player.root.addEventListener(MouseEvent.ROLL_OUT, (e: Event) => rootRolls.push(e.type));
    player.dispatchMouseMove(120, 10);
    expect(take()).toEqual(['A:mouseOut:target', 'A:rollOut:target']);
    // The root is below the Stage_Object (the common ancestor), so it is the target of its own rollOut.
    expect(rootRolls).toEqual(['rollOut']);
  });

  it('a press and a release on the same object fire no hover events', () => {
    const { player, take } = build();
    player.dispatchMouseMove(10, 10);
    take();
    player.dispatchClick(10, 10);
    expect(take()).toEqual(['A:mouseUp:target', 'A:click:target']);
  });

  it('dragging off the pressed object fires its drag-out, then the roll events; release elsewhere gives releaseOutside and an immediate rollOver', () => {
    const { player, take } = build();
    player.dispatchMouseMove(10, 10);
    player.dispatchMouseDown(10, 10);
    take();
    player.dispatchMouseMove(210, 10);
    // Ruffle dispatches the AVM2 drag-out and roll-out alike, and pushes both for the pressed object (read in player.rs).
    expect(take()).toEqual([
      'A:mouseOut:target',
      'A:rollOut:target',
      'A:mouseOut:target',
      'A:rollOut:target',
      'C:rollOver:target',
      'C:mouseOver:target',
      'C:mouseMove:target',
    ]);
    const outcome = player.dispatchMouseUp(210, 10);
    expect(outcome.releaseOutside?.pressed).toBe(player.root.getChildAt(0));
    // `from` is the object already hovered (C), so the chain up to the common ancestor is empty: no rollOver, but mouseOver.
    expect(take()).toEqual(['C:mouseUp:target', 'A:releaseOutside:target', 'C:mouseOver:target']);
  });

  it('dragging back onto the pressed object fires its drag-over and the roll events', () => {
    const { player, take } = build();
    player.dispatchMouseMove(10, 10);
    player.dispatchMouseDown(10, 10);
    player.dispatchMouseMove(210, 10);
    take();
    player.dispatchMouseMove(10, 10);
    expect(take()).toEqual([
      // drag-over of the pressed object first, then the roll out of C and the roll over of A (same dispatch twice for A)
      'A:rollOver:target',
      'A:mouseOver:target',
      'C:mouseOut:target',
      'C:rollOut:target',
      'A:rollOver:target',
      'A:mouseOver:target',
      'A:mouseMove:target',
    ]);
  });
});
