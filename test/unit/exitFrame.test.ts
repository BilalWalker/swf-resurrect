import { describe, expect, it } from 'vitest';
import { Event } from '../../template/shim/events';
import { exitFrame } from '../../template/shim/internal';
import { MovieClip } from '../../template/shim/MovieClip';

describe('exitFrame', () => {
  // exitFrame is a Broadcast_Event: registration order, not tree order (as3-coverage Requirement 7.9, task 10.1).
  // A constructor registers its children first, so for clips built bottom-up the two orders agree (Requirement 7.11).
  it('notifies every registered clip once, in registration order, playing or stopped', () => {
    const root = new MovieClip();
    const a = new MovieClip();
    const b = new MovieClip();
    root.addChild(a);
    a.addChild(b);
    b.stop();
    const seen: string[] = [];
    b.addEventListener(Event.EXIT_FRAME, () => seen.push('b'));
    a.addEventListener(Event.EXIT_FRAME, () => seen.push('a'));
    root.addEventListener(Event.EXIT_FRAME, () => seen.push('root'));
    exitFrame(root);
    // Children first because they registered first (verify task 12.1; reference/output.txt lines 13-15).
    expect(seen).toEqual(['b', 'a', 'root']);
  });

  it('still reaches a clip detached during the pass, and not a listener added during it', () => {
    const root = new MovieClip();
    const a = new MovieClip();
    const b = new MovieClip();
    root.addChild(a);
    root.addChild(b);
    const late = new MovieClip();
    let lateCalls = 0;
    let bCalls = 0;
    b.addEventListener(Event.EXIT_FRAME, () => bCalls++);
    a.addEventListener(Event.EXIT_FRAME, () => {
      root.removeChild(b);
      root.addChild(late);
      late.addEventListener(Event.EXIT_FRAME, () => lateCalls++);
    });
    exitFrame(root);
    // b registered before the pass began; being off the display list does not stop a Broadcast_Event.
    expect(bCalls).toBe(1);
    expect(lateCalls).toBe(0);
  });
});
