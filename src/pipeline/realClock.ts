// The real Clock (edge file: uses the global timers and performance.now). guard.ts stays pure.
import type { Clock } from './guard';

export const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout> | undefined),
};
