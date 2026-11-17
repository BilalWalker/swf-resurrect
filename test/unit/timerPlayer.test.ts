// Covers template/runtime/timers.ts (the scheduler) and its call from Player.update.
import { describe, expect, it } from "vitest";
import { MAX_TICKS, TimerQueue, type ScheduledTimer } from "../../template/runtime/timers";
import { Timer, TimerEvent } from "../../template/shim/Timer";
import { timerRig } from "../support/timerRig";

describe("timers on the Player clock", () => {
  it("fires after the frame steps of the tick, and the inspector lists the timer", () => {
    const r = timerRig(10);
    const t = new Timer(50);
    let fired = 0;
    t.addEventListener(TimerEvent.TIMER, () => fired++);
    t.start();
    expect(r.player.inspect().timers()).toEqual([{ delay: 50, running: true, currentCount: 0 }]);
    r.advance(120);
    expect(fired).toBe(2); // due 50 and 100, both below 120
    expect(r.player.inspect().tick).toBe(1);
    expect(r.player.inspect().timers()[0]).toEqual({ delay: 50, running: true, currentCount: 2 });
  });
  it("keeps firing when its owner is not on the display list", () => {
    const r = timerRig(30);
    let fired = 0;
    (() => {
      const t = new Timer(20);
      t.addEventListener(TimerEvent.TIMER, () => fired++);
      t.start();
    })();
    for (let i = 0; i < 10; i++) r.advance(100);
    expect(fired).toBeGreaterThan(30);
  });
  it("fires at most 10 times per update", () => {
    const r = timerRig(30);
    const t = new Timer(0);
    let fired = 0;
    t.addEventListener(TimerEvent.TIMER, () => fired++);
    t.start();
    r.advance(1000);
    expect(fired).toBe(MAX_TICKS);
    r.advance(1);
    expect(fired).toBe(2 * MAX_TICKS);
  });
  it("the queue fires the earliest due first and skips a timer a listener stopped", () => {
    const q = new TimerQueue();
    const log: string[] = [];
    const mk = (name: string, interval: number, onTick?: () => void): ScheduledTimer => ({
      due: 0, interval, scheduled: false,
      tick() { log.push(name); onTick?.(); },
    });
    const b = mk("b", 30);
    const a = mk("a", 20, () => q.remove(b));
    q.add(b, 0);
    q.add(a, 0);
    q.run(100);
    expect(log).toEqual(["a", "a", "a", "a"]); // a is due at 20, 40, 60, 80; b (due 30) was removed by the first
    expect(b.scheduled).toBe(false);
  });
});
