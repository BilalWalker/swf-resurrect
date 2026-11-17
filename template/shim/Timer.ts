import { scheduleInterval, timerGeneration, timerNow, timerQueue, type ScheduledTimer } from '../runtime/timers';
import { Event, EventDispatcher } from './events';
export class TimerEvent extends Event {
  static readonly TIMER = 'timer';
  static readonly TIMER_COMPLETE = 'timerComplete';
  constructor(type: string, bubbles = false, cancelable = false) {
    super(type, bubbles, cancelable);
  }
  override clone(): Event {
    return new TimerEvent(this.type, this.bubbles, this.cancelable);
  }
}
function checkDelay(delay: number): void {
  if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0) {
    throw new RangeError(`Error #2066: The Timer delay specified is out of range.`);
  }
}
const registry = new Set<WeakRef<Timer>>();
/** Internal (inspect.ts): the Timers made under the current Player that are still alive. */
export function _liveTimers(): Timer[] {
  const out: Timer[] = [];
  for (const ref of registry) {
    const t = ref.deref();
    if (t === undefined) registry.delete(ref);
    else if (t._generation === timerGeneration()) out.push(t);
  }
  return out;
}
/**
 * flash.utils.Timer on the Player clock. Fires from `Player.update` after the frame steps, whether or not any
 * display object holds it (Requirement 22.7). See runtime/timers.ts for the scheduling rules.
 */
export class Timer extends EventDispatcher {
  private _delay: number;
  private _repeatCount: number;
  private _currentCount = 0;
  private readonly entry: ScheduledTimer;
  /** Internal: the Player generation this Timer was made under. */
  readonly _generation: number = timerGeneration();
  constructor(delay: number, repeatCount = 0) {
    super();
    checkDelay(delay);
    this._delay = delay;
    this._repeatCount = Math.trunc(repeatCount) || 0;
    this.entry = { due: 0, interval: scheduleInterval(delay), scheduled: false, tick: () => this.onTick() };
    registry.add(new WeakRef(this));
  }
  get delay(): number {
    return this._delay;
  }
  /** A new delay on a running Timer restarts the interval and keeps `currentCount`. */
  set delay(value: number) {
    checkDelay(value);
    this._delay = value;
    this.entry.interval = scheduleInterval(value);
    if (this.running) {
      timerQueue().remove(this.entry);
      timerQueue().add(this.entry, timerNow());
    }
  }
  get repeatCount(): number {
    return this._repeatCount;
  }
  /** A count at or below `currentCount` stops a running Timer without an event. */
  set repeatCount(value: number) {
    this._repeatCount = Math.trunc(value) || 0;
    if (this.running && this._repeatCount > 0 && this._currentCount >= this._repeatCount) this.stop();
  }
  get currentCount(): number {
    return this._currentCount;
  }
  get running(): boolean {
    return this.entry.scheduled;
  }
  start(): void {
    if (!this.running) timerQueue().add(this.entry, timerNow());
  }
  stop(): void {
    timerQueue().remove(this.entry);
  }
  reset(): void {
    this.stop();
    this._currentCount = 0;
  }
  private onTick(): void {
    this._currentCount++;
    this.dispatchEvent(new TimerEvent(TimerEvent.TIMER));
    if (!this.running) return; // a listener stopped or reset it
    if (this._repeatCount > 0 && this._currentCount >= this._repeatCount) {
      this.stop(); // running is already false when TIMER_COMPLETE is dispatched
      this.dispatchEvent(new TimerEvent(TimerEvent.TIMER_COMPLETE));
    }
  }
}
