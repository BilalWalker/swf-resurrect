import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisplayListEntry, SpriteSymbol } from '../../template/runtime/scene';
import { ScriptQueue } from '../../template/runtime/scriptQueue';
import { DisplayObject } from '../../template/shim/DisplayObject';
import { Event } from '../../template/shim/events';
import {
  renderFrame,
  step,
  withConstructionContext,
  type ConstructionContext,
} from '../../template/shim/internal';
import * as publicShim from '../../template/shim';
import { MovieClip } from '../../template/shim/MovieClip';

const ID: DisplayListEntry['matrix'] = [1, 0, 0, 1, 0, 0];
const CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];

function entry(depth: number, symbolId: number, name = '', tx = 0): DisplayListEntry {
  return { depth, symbolId, matrix: [1, 0, 0, 1, tx, 0], colorTransform: CT, name };
}

function symbol(frames: DisplayListEntry[][], labels: SpriteSymbol['labels'] = []): SpriteSymbol {
  return { type: 'sprite', frameCount: frames.length, frames, labels };
}

interface Rig {
  ctx: ConstructionContext;
  scripts: ScriptQueue;
  detached: DisplayObject[];
  created: number[];
}

function rig(sym: SpriteSymbol, childFactory?: (e: DisplayListEntry) => DisplayObject): Rig {
  const scripts = new ScriptQueue();
  const detached: DisplayObject[] = [];
  const created: number[] = [];
  const ctx: ConstructionContext = {
    symbol: sym,
    symbolId: 1,
    scripts,
    hooks: {
      createChild: (e) => {
        created.push(e.symbolId);
        return childFactory ? childFactory(e) : new MovieClip();
      },
      childAttached: () => {},
      childDetached: (_p, c) => detached.push(c),
      applyMatrix: (c, m) => {
        c.x = m[4];
      },
      applyColorTransform: () => {},
    },
  };
  return { ctx, scripts, detached, created };
}

function make(r: Rig): MovieClip {
  const mc = withConstructionContext(r.ctx, () => new MovieClip());
  renderFrame(mc);
  return mc;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('MovieClip frames', () => {
  const three = () =>
    rig(symbol([[], [], []], [{ name: 'mid', frame: 2 }]));

  it('starts on frame 1, playing, with the symbol totals and labels', () => {
    const mc = make(three());
    expect(mc.currentFrame).toBe(1);
    expect(mc.totalFrames).toBe(3);
    expect(mc.currentLabels).toEqual([{ name: 'mid', frame: 2 }]);
  });

  it('gotoAndStop and gotoAndPlay accept frames and labels', () => {
    const mc = make(three());
    mc.gotoAndStop(3);
    expect(mc.currentFrame).toBe(3);
    mc.gotoAndPlay('mid');
    expect(mc.currentFrame).toBe(2);
    step(mc);
    expect(mc.currentFrame).toBe(3);
    mc.gotoAndStop('mid');
    step(mc);
    expect(mc.currentFrame).toBe(2);
  });

  it.each([0, 4, 1.5, NaN, 'nope'])('invalid frame %s leaves state unchanged and warns once', (bad) => {
    const mc = make(three());
    mc.gotoAndStop(2);
    warn.mockClear();
    mc.gotoAndPlay(bad);
    expect(mc.currentFrame).toBe(2);
    step(mc);
    expect(mc.currentFrame).toBe(2); // still stopped
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(String(bad));
  });

  it('wraps to frame 1 after the last frame and does not move when stopped', () => {
    const mc = make(rig(symbol([[], []])));
    step(mc);
    expect(mc.currentFrame).toBe(2);
    step(mc);
    expect(mc.currentFrame).toBe(1);
    mc.stop();
    step(mc);
    expect(mc.currentFrame).toBe(1);
  });

  it('a clip outside a construction context has one empty frame', () => {
    const mc = new MovieClip();
    expect(mc.totalFrames).toBe(1);
    expect(mc.currentFrame).toBe(1);
    expect(mc.currentLabels).toEqual([]);
    mc.gotoAndStop(1);
    expect(mc.numChildren).toBe(0);
    mc.gotoAndStop(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps state per instance', () => {
    const r = rig(symbol([[], []]));
    const a = make(r);
    const b = make(r);
    a.gotoAndStop(2);
    expect(b.currentFrame).toBe(1);
    expect(b.addFrameScript).not.toBe(undefined);
    a.addFrameScript(0, () => {});
    expect(b.frameScripts.size).toBe(0);
  });
});

describe('MovieClip frame scripts', () => {
  it('converts 0-based indices to 1-based frames', () => {
    const r = rig(symbol([[], []]));
    const mc = make(r);
    const fn = vi.fn();
    mc.addFrameScript(1, fn);
    expect(mc.frameScripts.get(2)).toBe(fn);
    step(mc);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('out-of-range index registers nothing and warns with the value', () => {
    const mc = make(rig(symbol([[], []])));
    mc.addFrameScript(2, () => {}, -1, () => {});
    expect(mc.frameScripts.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).toContain('2');
    expect(String(warn.mock.calls[1]![0])).toContain('-1');
  });

  it('warns about an odd argument count and registers only the complete pairs', () => {
    const mc = make(rig(symbol([[], []])));
    const fn = () => {};
    mc.addFrameScript(0, fn, 1);
    expect(mc.frameScripts.get(1)).toBe(fn);
    expect(mc.frameScripts.size).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('odd');
  });

  it('warns about a non-function and registers nothing for that pair', () => {
    const mc = make(rig(symbol([[], []])));
    mc.addFrameScript(0, 'nope' as unknown as () => void);
    expect(mc.frameScripts.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('function');
  });

  it('goto runs the target script at once, after rendering, outside a script', () => {
    const r = rig(symbol([[], [entry(1, 9)]]));
    const mc = make(r);
    let seenChildren = -1;
    mc.addFrameScript(1, () => {
      seenChildren = mc.numChildren;
    });
    mc.gotoAndStop(2);
    expect(seenChildren).toBe(1);
  });

  it('goto inside a script renders now but defers the target script until the current one returns', () => {
    const mc = make(rig(symbol([[], [], []])));
    const order: string[] = [];
    mc.addFrameScript(
      1,
      () => {
        order.push('start2');
        mc.gotoAndStop(3);
        order.push(`frame${mc.currentFrame}`);
        order.push('end2');
      },
      2,
      () => order.push('script3'),
    );
    step(mc); // enters frame 2
    expect(order).toEqual(['start2', 'frame3', 'end2', 'script3']);
  });
});

describe('MovieClip children and instance names', () => {
  it('creates children from the frame, exposes names and removes them with the property', () => {
    const r = rig(symbol([[entry(1, 7, 'btn')], []]));
    const mc = make(r) as MovieClip & { btn?: DisplayObject };
    const child = mc.btn!;
    expect(child).toBeInstanceOf(MovieClip);
    expect(child.name).toBe('btn');
    expect(child.parent).toBe(mc);
    step(mc);
    expect(mc.numChildren).toBe(0);
    expect('btn' in mc).toBe(false);
    expect(r.detached).toEqual([child]);
  });

  it('reuses the same object for the same depth and symbol and re-applies only changes', () => {
    const r = rig(symbol([[entry(1, 7, 'a', 0)], [entry(1, 7, 'a', 5)]]));
    const mc = make(r) as MovieClip & { a?: DisplayObject };
    const first = mc.a!;
    first.x = 99; // script-set value persists while the matrix is unchanged
    step(mc);
    expect(mc.a).toBe(first);
    expect(first.x).toBe(5);
    expect(r.created).toEqual([7]);
  });

  it('replaces the child when the symbol changes at a depth', () => {
    const r = rig(symbol([[entry(1, 7, 'a')], [entry(1, 8, 'a')]]));
    const mc = make(r) as MovieClip & { a?: DisplayObject };
    const first = mc.a!;
    step(mc);
    expect(mc.a).not.toBe(first);
    expect(first.parent).toBeNull();
    expect(mc.numChildren).toBe(1);
  });

  it('removes a property only if it still points at the removed child', () => {
    const r = rig(symbol([[entry(1, 7, 'a')], []]));
    const mc = make(r) as MovieClip & { a?: unknown };
    const replacement = {};
    mc.a = replacement;
    step(mc);
    expect(mc.a).toBe(replacement);
  });

  it('keeps timeline children in ascending depth order', () => {
    const r = rig(symbol([[entry(5, 1, 'hi')], [entry(2, 2, 'lo'), entry(5, 1, 'hi')]]));
    const mc = make(r) as MovieClip & { lo?: DisplayObject; hi?: DisplayObject };
    step(mc);
    expect(mc._children[0]).toBe(mc.lo);
    expect(mc._children[1]).toBe(mc.hi);
  });

  it('dispatches ENTER_FRAME to stopped clips and to children that existed before the tick', () => {
    const r = rig(symbol([[entry(1, 7, 'kid')], [entry(1, 7, 'kid'), entry(2, 8, 'late')]]));
    const mc = make(r) as MovieClip & { kid?: MovieClip; late?: MovieClip };
    const kid = mc.kid!;
    kid.stop();
    let kidTicks = 0;
    kid.addEventListener(Event.ENTER_FRAME, () => kidTicks++);
    step(mc);
    expect(kidTicks).toBe(1);
    let lateTicks = 0;
    mc.late!.addEventListener(Event.ENTER_FRAME, () => lateTicks++);
    expect(lateTicks).toBe(0); // created during this tick, not stepped in it
  });
});

describe('construction context', () => {
  it('restores the previous context, including after a throw', () => {
    const r = rig(symbol([[], []]));
    expect(() =>
      withConstructionContext(r.ctx, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(new MovieClip().totalFrames).toBe(1);
  });

  it('lets a subclass constructor stop and register scripts', () => {
    class Btn extends MovieClip {
      constructor() {
        super();
        this.stop();
        this.addFrameScript(0, () => {});
      }
    }
    const r = rig(symbol([[], []]));
    const b = withConstructionContext(r.ctx, () => new Btn());
    step(b);
    expect(b.currentFrame).toBe(1);
    expect(b.frameScripts.has(1)).toBe(true);
  });
});

describe('shim public surface', () => {
  it('does not export the internal API', () => {
    expect(Object.keys(publicShim).sort()).toEqual(
      ['DisplayObject', 'DisplayObjectContainer', 'Event', 'EventDispatcher', 'MouseEvent', 'MovieClip', 'Sprite'],
    );
  });
});
