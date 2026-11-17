// Fake Clock for guard tests: time moves only when a test calls advance().
import type { Clock } from '../../src/pipeline/guard';

export interface FakeClock extends Clock {
  /** Moves time forward and fires due timers in order; each timer sees now() at its own due time. */
  advance(ms: number): void;
  pending(): number;
}

export function createFakeClock(): FakeClock {
  let time = 0;
  let nextId = 1;
  const timers = new Map<number, { due: number; fn: () => void }>();
  return {
    now: () => time,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { due: time + ms, fn });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    advance(ms) {
      const target = time + ms;
      for (;;) {
        let best: [number, { due: number; fn: () => void }] | null = null;
        for (const e of timers) if (e[1].due <= target && (best === null || e[1].due < best[1].due)) best = e;
        if (best === null) break;
        timers.delete(best[0]);
        time = Math.max(time, best[1].due);
        best[1].fn();
      }
      time = target;
    },
    pending: () => timers.size,
  };
}
