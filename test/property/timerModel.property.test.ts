import fc from "fast-check";
import { describe, it } from "vitest";
import { Timer, TimerEvent } from "../../template/shim/Timer";
import { timerRig } from "../support/timerRig";

/** The pure state model of design "Timer". */
class TimerModel {
  running = false;
  count = 0;
  now = 0;
  due = 0;
  ticks = 0;
  completes = 0;
  constructor(readonly repeat: number, readonly interval: number) {}
  start(): void {
    if (this.running) return;
    this.running = true;
    this.due = this.now + this.interval;
  }
  stop(): void {
    this.running = false;
  }
  reset(): void {
    this.count = 0;
    this.running = false;
  }
  advance(t: number): void {
    this.now = t;
    let fired = 0;
    while (this.running && this.due < this.now && fired < 10) {
      fired++;
      this.count++;
      this.ticks++;
      if (this.repeat !== 0 && this.count >= this.repeat) {
        this.running = false;
        this.completes++;
      } else this.due += this.interval;
    }
  }
}
type Op = { k: "start" } | { k: "stop" } | { k: "reset" } | { k: "advance"; ms: number };
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constant<Op>({ k: "start" }),
  fc.constant<Op>({ k: "stop" }),
  fc.constant<Op>({ k: "reset" }),
  fc.record({ k: fc.constant("advance" as const), ms: fc.integer({ min: 0, max: 400 }) }),
);

describe("Property 21: Timer agrees with the model", () => {
  /** **Validates: Requirements 22.1, 22.3, 22.4, 22.5, 22.6, 22.8, 22.10, 22.12, 22.13** */
  it("running, currentCount and event counts equal the model", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(30, 60),
        fc.oneof(fc.integer({ min: 0, max: 15 }), fc.integer({ min: 16, max: 200 })),
        fc.integer({ min: 0, max: 5 }),
        fc.array(opArb, { maxLength: 40 }),
        (fps, delay, repeat, ops) => {
          const r = timerRig(fps);
          const t = new Timer(delay, repeat);
          const m = new TimerModel(repeat, Math.max(delay, 10));
          let ticks = 0;
          let completes = 0;
          t.addEventListener(TimerEvent.TIMER, () => ticks++);
          t.addEventListener(TimerEvent.TIMER_COMPLETE, () => completes++);
          for (const op of ops) {
            if (op.k === "start") (t.start(), m.start());
            else if (op.k === "stop") (t.stop(), m.stop());
            else if (op.k === "reset") (t.reset(), m.reset());
            else {
              r.advance(op.ms);
              m.advance(r.clock.now());
            }
            if (t.running !== m.running || t.currentCount !== m.count || ticks !== m.ticks || completes !== m.completes) {
              throw new Error(`diverged after ${JSON.stringify(op)}: ${t.running}/${t.currentCount}/${ticks}/${completes} vs ${m.running}/${m.count}/${m.ticks}/${m.completes}`);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
