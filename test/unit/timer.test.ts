import { describe, expect, it } from "vitest";
import { Timer, TimerEvent } from "../../template/shim/Timer";
import { timerRig } from "../support/timerRig";

describe.each([30, 60])("Timer at %i fps on the manual clock", (fps) => {
  const frame = 1000 / fps;
  function counts(t: Timer): { tick: number; done: number } {
    const c = { tick: 0, done: 0 };
    t.addEventListener(TimerEvent.TIMER, () => c.tick++);
    t.addEventListener(TimerEvent.TIMER_COMPLETE, () => c.done++);
    return c;
  }
  it("exports the event names", () => {
    expect(TimerEvent.TIMER).toBe("timer");
    expect(TimerEvent.TIMER_COMPLETE).toBe("timerComplete");
  });
  it("throws RangeError for a negative, NaN or infinite delay", () => {
    timerRig(fps);
    for (const bad of [-1, NaN, Infinity, -Infinity]) expect(() => new Timer(bad)).toThrow(RangeError);
    const t = new Timer(100);
    expect(() => (t.delay = -5)).toThrow(RangeError);
    expect(t.delay).toBe(100);
  });
  it("fires after a full delay, strictly", () => {
    const r = timerRig(fps);
    const t = new Timer(100);
    const c = counts(t);
    t.start();
    expect(t.running).toBe(true);
    r.advance(100); // due == now: not yet
    expect(c.tick).toBe(0);
    r.advance(1);
    expect(c.tick).toBe(1);
    expect(t.currentCount).toBe(1);
  });
  it("completes after repeatCount firings, running false before TIMER_COMPLETE", () => {
    const r = timerRig(fps);
    const t = new Timer(50, 2);
    const seen: boolean[] = [];
    t.addEventListener(TimerEvent.TIMER_COMPLETE, () => seen.push(t.running));
    const c = counts(t);
    t.start();
    for (let i = 0; i < 40; i++) r.advance(frame);
    expect(c.tick).toBe(2);
    expect(c.done).toBe(1);
    expect(seen).toEqual([false]);
    expect(t.running).toBe(false);
  });
  it("stop keeps currentCount; start schedules a full interval; reset zeroes", () => {
    const r = timerRig(fps);
    const t = new Timer(100);
    const c = counts(t);
    t.start();
    r.advance(150);
    expect(t.currentCount).toBe(1);
    r.advance(40);
    t.stop();
    expect(t.running).toBe(false);
    expect(t.currentCount).toBe(1);
    r.advance(500);
    expect(c.tick).toBe(1);
    t.start();
    r.advance(90);
    expect(c.tick).toBe(1);
    r.advance(20);
    expect(c.tick).toBe(2);
    t.reset();
    expect(t.running).toBe(false);
    expect(t.currentCount).toBe(0);
  });
  it("a delay below 10 ms is scheduled at 10 ms and reads back unchanged", () => {
    const r = timerRig(fps);
    const t = new Timer(1);
    const c = counts(t);
    expect(t.delay).toBe(1);
    t.start();
    r.advance(10);
    expect(c.tick).toBe(0);
    r.advance(1);
    expect(c.tick).toBe(1);
  });
  it("start after completion fires once and completes again", () => {
    const r = timerRig(fps);
    const t = new Timer(20, 1);
    const c = counts(t);
    t.start();
    r.advance(100);
    expect(c).toEqual({ tick: 1, done: 1 });
    t.start();
    r.advance(100);
    expect(c).toEqual({ tick: 2, done: 2 });
    expect(t.currentCount).toBe(2);
    expect(t.running).toBe(false);
  });
  it("a delay change on a running timer restarts the interval and keeps the count", () => {
    const r = timerRig(fps);
    const t = new Timer(100);
    const c = counts(t);
    t.start();
    r.advance(90);
    t.delay = 200;
    r.advance(150);
    expect(c.tick).toBe(0);
    r.advance(100);
    expect(c.tick).toBe(1);
    t.repeatCount = 1;
    expect(t.running).toBe(false);
    expect(c.done).toBe(0);
  });
});
