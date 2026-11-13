import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import type { CaughtError } from '../../template/runtime/errorReport';
import { Event, EventDispatcher, MouseEvent } from '../../template/shim/events';
import { setCaughtErrorSink } from '../../template/shim/internal';
import { Sprite } from '../../template/shim/Sprite';

describe('MouseEvent constants and bubbling defaults', () => {
  it('defines the pointer constants', () => {
    expect(MouseEvent.CLICK).toBe('click');
    expect(MouseEvent.MOUSE_DOWN).toBe('mouseDown');
    expect(MouseEvent.MOUSE_UP).toBe('mouseUp');
    expect(MouseEvent.MOUSE_MOVE).toBe('mouseMove');
  });

  it.each([
    [MouseEvent.CLICK, true],
    [MouseEvent.MOUSE_DOWN, true],
    [MouseEvent.MOUSE_UP, true],
    [MouseEvent.MOUSE_MOVE, true],
    [Event.ADDED, true],
    [Event.REMOVED, true],
    [Event.ENTER_FRAME, false],
  ])('%s bubbles by default: %s', (type, expected) => {
    expect(new Event(type).bubbles).toBe(expected);
    expect(new MouseEvent(type).bubbles).toBe(expected);
  });

  it('an explicit bubbles argument wins', () => {
    expect(new MouseEvent(MouseEvent.MOUSE_DOWN, false).bubbles).toBe(false);
    expect(new MouseEvent(MouseEvent.CLICK, false).bubbles).toBe(false);
  });
});

describe('listener isolation (Requirement 25.2)', () => {
  const caught: CaughtError[] = [];
  afterEach(() => {
    setCaughtErrorSink(null);
    caught.length = 0;
  });

  it('a throwing listener is reported and the next listener of the target runs', () => {
    setCaughtErrorSink((e) => caught.push(e));
    const d = new EventDispatcher();
    const log: string[] = [];
    d.addEventListener('ping', () => {
      throw new Error('bad listener');
    });
    d.addEventListener('ping', () => log.push('second'));
    expect(() => d.dispatchEvent(new Event('ping'))).not.toThrow();
    expect(log).toEqual(['second']);
    expect(caught).toEqual([{ site: 'listener ping on EventDispatcher', message: 'bad listener', className: null }]);
  });

  it('the event path continues to the parent after a throwing listener, named by instance name', () => {
    setCaughtErrorSink((e) => caught.push(e));
    const parent = new Sprite();
    const child = new Sprite();
    parent.addChild(child);
    child.name = 'hero';
    const log: string[] = [];
    child.addEventListener('click', () => {
      throw 'text';
    });
    child.addEventListener('click', () => log.push('child 2'));
    parent.addEventListener('click', () => log.push('parent'));
    child.dispatchEvent(new Event('click'));
    expect(log).toEqual(['child 2', 'parent']);
    expect(caught.map((c) => [c.site, c.message])).toEqual([['listener click on hero', 'text']]);
  });

  it('a throw inside a nested dispatchEvent is isolated at the inner dispatch', () => {
    setCaughtErrorSink((e) => caught.push(e));
    const d = new EventDispatcher();
    const log: string[] = [];
    d.addEventListener('outer', () => {
      log.push('outer start');
      d.dispatchEvent(new Event('inner'));
      log.push('outer end');
    });
    d.addEventListener('outer', () => log.push('outer 2'));
    d.addEventListener('inner', () => {
      throw new Error('inner boom');
    });
    d.dispatchEvent(new Event('outer'));
    expect(log).toEqual(['outer start', 'outer end', 'outer 2']);
    expect(caught.map((c) => c.site)).toEqual(['listener inner on EventDispatcher']);
  });
});
describe('Event.formatToString (instance method, as in Ruffle Event.as)', () => {
  // Shaped like fl.events.ComponentEvent and fl.events.SliderEvent: a bare call inside an instance toString.
  // `npm run typecheck` compiles this file, so a missing or static member would give TS2339 or TS4113 here.
  class ComponentEventLike extends Event {
    override toString(): string {
      return this.formatToString('ComponentEvent', 'type', 'bubbles', 'cancelable');
    }
  }
  class SliderEventLike extends Event {
    value = 3;
    keyCode = 0;
    clickTarget = 'thumb';
    override toString(): string {
      return this.formatToString('SliderEvent', 'type', 'value', 'bubbles', 'cancelable', 'keyCode', 'clickTarget');
    }
  }
  it('quotes a string, writes a number and a boolean as they are, in the order given', () => {
    const e = new SliderEventLike('change', true);
    expect(e.toString()).toBe('[SliderEvent type="change" value=3 bubbles=true cancelable=false keyCode=0 clickTarget="thumb"]');
    expect(new ComponentEventLike('buttonDown').toString()).toBe('[ComponentEvent type="buttonDown" bubbles=false cancelable=false]');
  });
  it('matches Event.toString and handles no properties and an unknown one', () => {
    const e = new Event('x', true, true);
    expect(e.toString()).toBe('[Event type="x" bubbles=true cancelable=true eventPhase=2]');
    expect(e.formatToString('Event', 'type', 'bubbles', 'cancelable', 'eventPhase')).toBe(e.toString());
    expect(e.formatToString('Bare')).toBe('[Bare]');
    expect(e.formatToString('E', 'nope')).toBe('[E nope=undefined]');
  });
});