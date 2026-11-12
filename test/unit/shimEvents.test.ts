import { describe, expect, it } from 'vitest';
import { Event, MouseEvent } from '../../template/shim/events';

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
