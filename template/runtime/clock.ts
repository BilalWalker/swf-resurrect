/** Monotonic time source in milliseconds. */
export interface Clock {
  now(): number;
}

/** Test clock that only moves when advanced. */
export class ManualClock implements Clock {
  private time = 0;

  advance(ms: number): void {
    this.time += ms;
  }

  now(): number {
    return this.time;
  }
}
