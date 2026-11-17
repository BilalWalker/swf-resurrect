// Validates: Requirements 6.1, 6.2, 6.3, 6.4
import { afterEach, describe, expect, it } from 'vitest';
import { Event, EventDispatcher } from '../../template/shim/events';
import { takeNamedLimits } from '../../template/shim/internal';

afterEach(() => takeNamedLimits());

function run(setup: (d: EventDispatcher, log: string[]) => void): string[] {
  const d = new EventDispatcher();
  const log: string[] = [];
  setup(d, log);
  d.dispatchEvent(new Event('x'));
  return log;
}

describe('addEventListener priority (design D5, Ruffle events.rs)', () => {
  it('calls a higher priority first and equal priorities in insertion order', () => {
    const log = run((d, l) => {
      d.addEventListener('x', () => l.push('a0'));
      d.addEventListener('x', () => l.push('b5'), false, 5);
      d.addEventListener('x', () => l.push('c0'));
      d.addEventListener('x', () => l.push('d5'), false, 5);
      d.addEventListener('x', () => l.push('e-1'), false, -1);
    });
    expect(log).toEqual(['b5', 'd5', 'a0', 'c0', 'e-1']);
  });
  it('ignores a listener already present at any priority', () => {
    const log = run((d, l) => {
      const f = (): void => void l.push('f');
      d.addEventListener('x', f, false, 1);
      d.addEventListener('x', f, false, 9);
      d.addEventListener('x', f);
    });
    expect(log).toEqual(['f']);
  });
  it('removeEventListener removes the listener whatever its priority', () => {
    const log = run((d, l) => {
      const f = (): void => void l.push('f');
      d.addEventListener('x', f, false, 3);
      d.removeEventListener('x', f, false);
      expect(d.hasEventListener('x')).toBe(false);
    });
    expect(log).toEqual([]);
  });
  it('records useCapture and useWeakReference as Named_Limits, once each', () => {
    const d = new EventDispatcher();
    d.addEventListener('x', () => {}, true, 0, true);
    d.addEventListener('y', () => {}, true);
    const limits = takeNamedLimits();
    expect(limits.map((l) => l.id)).toEqual(['useCapture-ignored', 'useWeakReference-ignored']);
    expect(limits[1].detail).toBe("addEventListener('x') useWeakReference is ignored: listeners are held strongly");
    expect(takeNamedLimits()).toEqual([]);
  });
});
