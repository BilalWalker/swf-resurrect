// Feature: as3-coverage, Property 5: Listener order follows priority
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { Event, EventDispatcher } from '../../template/shim/events';

describe('Property 5: Listener order follows priority', () => {
  it('calls distinct listeners by descending priority, then insertion order; a repeat is ignored', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: -3, max: 3 })), { maxLength: 30 }), (calls) => {
        const d = new EventDispatcher();
        const log: number[] = [];
        const fns = Array.from({ length: 6 }, (_, i) => (): void => void log.push(i));
        const first = new Map<number, { p: number; order: number }>();
        calls.forEach(([id, p], order) => {
          d.addEventListener('x', fns[id]!, false, p);
          if (!first.has(id)) first.set(id, { p, order });
        });
        d.dispatchEvent(new Event('x'));
        const expected = [...first.entries()]
          .sort((a, b) => b[1].p - a[1].p || a[1].order - b[1].order)
          .map(([id]) => id);
        return JSON.stringify(log) === JSON.stringify(expected);
      }),
      { numRuns: 200 },
    );
  });
});
