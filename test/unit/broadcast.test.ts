// Broadcast_Events in registration order and Stage children stepped in the same phases (as3-coverage task 10.1).
// Validates: Requirements 7.5, 7.8, 7.9
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import type { Player } from '../../template/runtime/player';
import { Event, EventDispatcher } from '../../template/shim/events';
import { MovieClip } from '../../template/shim/MovieClip';
import { Sprite } from '../../template/shim/Sprite';
import { playerOn } from '../support/playerOn';

function tick(clock: ManualClock, player: Player): void {
  clock.advance(100);
  player.update();
}

describe('Broadcast_Events', () => {
  it('are delivered in the order of first registration, tree position aside', () => {
    const clock = new ManualClock();
    const p = playerOn(clock);
    const seen: string[] = [];
    const a = new Sprite();
    const b = new Sprite();
    const onStage = new Sprite();
    p.stage.addChild(onStage);
    // b registers first and is not on the display list; the Stage registers in the middle.
    b.addEventListener(Event.ENTER_FRAME, () => seen.push('b'));
    p.stage.addEventListener(Event.ENTER_FRAME, () => seen.push('stage'));
    onStage.addEventListener(Event.ENTER_FRAME, () => seen.push('onStage'));
    a.addEventListener(Event.ENTER_FRAME, () => seen.push('a'));
    p.root.addEventListener(Event.ENTER_FRAME, () => seen.push('root'));
    tick(clock, p);
    expect(seen).toEqual(['b', 'stage', 'onStage', 'a', 'root']);
  });

  it('reach each registered listener once per frame step, for all three types', () => {
    const clock = new ManualClock();
    const p = playerOn(clock);
    const seen: string[] = [];
    for (const t of [Event.EXIT_FRAME, Event.FRAME_CONSTRUCTED, Event.ENTER_FRAME]) {
      p.stage.addEventListener(t, () => seen.push(t));
    }
    tick(clock, p);
    expect(seen).toEqual([Event.ENTER_FRAME, Event.FRAME_CONSTRUCTED, Event.EXIT_FRAME]);
    tick(clock, p);
    expect(seen).toHaveLength(6);
  });

  it('dispatch enterFrame to the Stage once per tick, two steps giving two events', () => {
    const clock = new ManualClock();
    const p = playerOn(clock);
    let n = 0;
    p.stage.addEventListener(Event.ENTER_FRAME, () => n++);
    clock.advance(200);
    p.update();
    expect(n).toBe(2);
  });

  it('skip and forget an object that removed its listener; a later registration goes to the end', () => {
    const clock = new ManualClock();
    const p = playerOn(clock);
    const seen: string[] = [];
    const a = new Sprite();
    const b = new Sprite();
    const la = (): number => seen.push('a');
    a.addEventListener(Event.ENTER_FRAME, la);
    b.addEventListener(Event.ENTER_FRAME, () => seen.push('b'));
    a.removeEventListener(Event.ENTER_FRAME, la);
    tick(clock, p);
    a.addEventListener(Event.ENTER_FRAME, la);
    tick(clock, p);
    expect(seen).toEqual(['b', 'b', 'a']);
  });

  it('ignore a plain dispatcher: only display objects and the Stage take part', () => {
    const clock = new ManualClock();
    const p = playerOn(clock);
    const plain = new EventDispatcher();
    let n = 0;
    plain.addEventListener(Event.ENTER_FRAME, () => n++);
    tick(clock, p);
    expect(n).toBe(0);
  });
});

describe('Stage children step with the root', () => {
  it('advance their timeline each frame step', () => {
    const clock = new ManualClock();
    const p = playerOn(clock);
    const mc = new MovieClip();
    p.stage.addChild(mc);
    const frames: number[] = [];
    mc.addEventListener(Event.ENTER_FRAME, () => frames.push(mc.currentFrame));
    tick(clock, p);
    tick(clock, p);
    expect(frames).toHaveLength(2);
  });
});
