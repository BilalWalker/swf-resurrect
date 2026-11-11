import { describe, expect, it } from 'vitest';
import { Event } from '../../template/shim/events';
import { exitFrame } from '../../template/shim/internal';
import { MovieClip } from '../../template/shim/MovieClip';

describe('exitFrame', () => {
  it('notifies every attached clip once, in pre-order, playing or stopped', () => {
    const root = new MovieClip();
    const a = new MovieClip();
    const b = new MovieClip();
    root.addChild(a);
    a.addChild(b);
    b.stop();
    const seen: string[] = [];
    root.addEventListener(Event.EXIT_FRAME, () => seen.push('root'));
    a.addEventListener(Event.EXIT_FRAME, () => seen.push('a'));
    b.addEventListener(Event.EXIT_FRAME, () => seen.push('b'));
    exitFrame(root);
    expect(seen).toEqual(['root', 'a', 'b']);
  });

  it('skips a clip detached during the pass and a clip added during it', () => {
    const root = new MovieClip();
    const a = new MovieClip();
    const b = new MovieClip();
    root.addChild(a);
    root.addChild(b);
    const late = new MovieClip();
    let lateCalls = 0;
    let bCalls = 0;
    late.addEventListener(Event.EXIT_FRAME, () => lateCalls++);
    b.addEventListener(Event.EXIT_FRAME, () => bCalls++);
    a.addEventListener(Event.EXIT_FRAME, () => {
      root.removeChild(b);
      root.addChild(late);
    });
    exitFrame(root);
    expect(bCalls).toBe(0);
    expect(lateCalls).toBe(0);
  });
});
