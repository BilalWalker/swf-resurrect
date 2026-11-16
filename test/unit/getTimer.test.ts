import { describe, expect, it } from "vitest";
import { ManualClock } from "../../template/runtime/clock";
import { getTimer } from "../../template/shim";
import { playerOn } from "../support/playerOn";

describe("getTimer", () => {
  it("starts at 0 and grows by 1000 when the manual clock advances 1000 ms", () => {
    const clock = new ManualClock();
    clock.advance(500);
    playerOn(clock);
    expect(getTimer()).toBe(0);
    clock.advance(1000);
    expect(getTimer()).toBe(1000);
  });
  it("is an integer", () => {
    const clock = new ManualClock();
    playerOn(clock);
    clock.advance(10.9);
    expect(getTimer()).toBe(10);
  });
});
