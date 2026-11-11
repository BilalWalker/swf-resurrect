import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DisplayObject } from '../../template/shim/DisplayObject';
import { Event, EventDispatcher, MouseEvent } from '../../template/shim/events';
import { Sprite } from '../../template/shim/Sprite';

describe('EventDispatcher', () => {
  it('calls listeners in registration order and registers a duplicate once', () => {
    const d = new EventDispatcher();
    const log: string[] = [];
    const a = () => log.push('a');
    const b = () => log.push('b');
    d.addEventListener(MouseEvent.CLICK, a);
    d.addEventListener(MouseEvent.CLICK, b);
    d.addEventListener(MouseEvent.CLICK, a);
    d.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
    expect(log).toEqual(['a', 'b']);
  });

  it('removal during dispatch applies from the next dispatch', () => {
    const d = new EventDispatcher();
    const log: string[] = [];
    const b = () => log.push('b');
    const a = () => {
      log.push('a');
      d.removeEventListener(Event.ENTER_FRAME, b);
    };
    d.addEventListener(Event.ENTER_FRAME, a);
    d.addEventListener(Event.ENTER_FRAME, b);
    d.dispatchEvent(new Event(Event.ENTER_FRAME));
    d.dispatchEvent(new Event(Event.ENTER_FRAME));
    expect(log).toEqual(['a', 'b', 'a']);
  });

  it('listener added during dispatch is not called in that dispatch', () => {
    const d = new EventDispatcher();
    const log: string[] = [];
    d.addEventListener('x', () => {
      log.push('first');
      d.addEventListener('x', () => log.push('late'));
    });
    d.dispatchEvent(new Event('x'));
    expect(log).toEqual(['first']);
  });

  it('sets target and currentTarget', () => {
    const d = new EventDispatcher();
    const e = new Event('x');
    d.dispatchEvent(e);
    expect(e.target).toBe(d);
    expect(e.currentTarget).toBe(d);
  });
});

describe('DisplayObject', () => {
  it('has defaults', () => {
    const o = new DisplayObject();
    expect([o.x, o.y, o.scaleX, o.scaleY, o.rotation, o.alpha, o.visible, o.name]).toEqual([
      0, 0, 1, 1, 0, 1, true, '',
    ]);
    expect(o.parent).toBeNull();
  });

  it('clamps alpha to [0, 1]', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (v) => {
        const o = new DisplayObject();
        o.alpha = v;
        expect(o.alpha).toBe(Math.min(1, Math.max(0, v)));
      }),
    );
  });

  it('width and height follow intrinsic size and scale; setters adjust scale', () => {
    const o = new DisplayObject();
    o._intrinsicWidth = 10;
    o._intrinsicHeight = 20;
    o.scaleX = 2;
    expect(o.width).toBe(20);
    o.height = 40;
    expect(o.scaleY).toBe(2);
  });
});

describe('Sprite', () => {
  it('appends children, counts direct children and finds by name', () => {
    const s = new Sprite();
    const a = new Sprite();
    const b = new DisplayObject();
    a.name = 'a';
    b.name = 'b';
    expect(s.addChild(a)).toBe(a);
    s.addChild(b);
    expect(s.numChildren).toBe(2);
    expect(s._children).toEqual([a, b]);
    expect(a.parent).toBe(s);
    expect(s.getChildByName('b')).toBe(b);
    expect(s.getChildByName('zzz')).toBeNull();
    a.addChild(new DisplayObject()).name = 'deep';
    expect(s.getChildByName('deep')).toBeNull();
  });

  it('removeChild clears parent; re-adding moves between parents', () => {
    const p = new Sprite();
    const q = new Sprite();
    const c = new DisplayObject();
    p.addChild(c);
    q.addChild(c);
    expect(p.numChildren).toBe(0);
    expect(c.parent).toBe(q);
    q.removeChild(c);
    expect(c.parent).toBeNull();
    expect(() => q.removeChild(c)).toThrow();
  });

  it('rejects adding itself or an ancestor', () => {
    const p = new Sprite();
    const c = new Sprite();
    p.addChild(c);
    expect(() => c.addChild(p)).toThrow();
    expect(() => p.addChild(p)).toThrow();
  });
});
