// MouseEvent additions (as3-coverage task 16.4). Validates: Requirements 17.1, 17.2
import { describe, expect, it } from 'vitest';
import { takeNamedLimits } from '../../template/shim/errorSink';
import { EventDispatcher, MouseEvent } from '../../template/shim/events';
describe('MouseEvent additions', () => {
  it('MOUSE_WHEEL is "mouseWheel" and delta defaults to 0', () => {
    expect(MouseEvent.MOUSE_WHEEL).toBe('mouseWheel');
    expect(new MouseEvent(MouseEvent.MOUSE_WHEEL).delta).toBe(0);
  });
  it('registering for the wheel records mouse-wheel-not-dispatched, once', () => {
    takeNamedLimits();
    const d = new EventDispatcher();
    d.addEventListener(MouseEvent.MOUSE_WHEEL, () => {});
    d.addEventListener(MouseEvent.CLICK, () => {});
    const ids = takeNamedLimits().map((l) => l.id);
    expect(ids).toEqual(['mouse-wheel-not-dispatched']);
  });
});