/**
 * The Timer scheduler of the Player clock (as3-coverage Requirement 22, design "Timer"). Pure: no Flash type, no
 * wall clock. The rules were read in Ruffle `core/src/timer.rs` earlier (design), not re-read here:
 *   - an interval below 10 ms is scheduled at 10 ms (`MIN_INTERVAL`);
 *   - a timer fires only when its due time is strictly below the current time, and its next due time is the old one
 *     plus the interval (not `now` plus the interval);
 *   - one `run` fires at most 10 times in total (`MAX_TICKS`); a timer still behind fires on the next run;
 *   - `Player.update` calls `run` after the frame steps, with `clock.now()`.
 */
export const MIN_INTERVAL = 10;
export const MAX_TICKS = 10;
/** One scheduled timer. `scheduled` is true while the timer is in the queue (a Timer's `running`). */
export interface ScheduledTimer {
  due: number;
  interval: number;
  scheduled: boolean;
  tick(): void;
}
/** The interval a delay is scheduled at. The delay itself reads back unchanged. */
export function scheduleInterval(delay: number): number {
  return Math.max(delay, MIN_INTERVAL);
}
export class TimerQueue {
  private entries: ScheduledTimer[] = [];
  /** Schedules a full interval from `now`. A timer already scheduled is left alone. */
  add(timer: ScheduledTimer, now: number): void {
    if (timer.scheduled) return;
    timer.scheduled = true;
    timer.due = now + timer.interval;
    this.entries.push(timer);
  }
  remove(timer: ScheduledTimer): void {
    timer.scheduled = false;
    const i = this.entries.indexOf(timer);
    if (i >= 0) this.entries.splice(i, 1);
  }
  /** Fires due timers, earliest due time first (insertion order on a tie), at most MAX_TICKS times. */
  run(now: number): number {
    let ticks = 0;
    while (ticks < MAX_TICKS) {
      let next: ScheduledTimer | null = null;
      for (const e of this.entries) if (e.due < now && (next === null || e.due < next.due)) next = e;
      if (next === null) break;
      const before = next.due;
      ticks++;
      next.tick();
      // A listener that stopped the timer, or restarted it (a new due time), has already settled the schedule.
      if (next.scheduled && next.due === before) next.due += next.interval;
    }
    return ticks;
  }
  clear(): void {
    for (const e of this.entries) e.scheduled = false;
    this.entries = [];
  }
}
let queue = new TimerQueue();
let readNow: () => number = () => 0;
let generation = 0;
/** The Player calls this when it is constructed: a fresh queue on `now`, and a new generation for the Timer registry. */
export function bindTimerClock(now: () => number): void {
  queue.clear();
  queue = new TimerQueue();
  readNow = now;
  generation++;
}
export function timerQueue(): TimerQueue {
  return queue;
}
export function timerNow(): number {
  return readNow();
}
/** Which Player the Timers belong to; a Timer made under an earlier Player is not listed by inspect(). */
export function timerGeneration(): number {
  return generation;
}
/** Player.update: fire the due timers at the clock time. */
export function runDueTimers(): void {
  queue.run(readNow());
}
