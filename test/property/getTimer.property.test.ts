import fc from "fast-check";
import { describe, it } from "vitest";
import { ManualClock } from "../../template/runtime/clock";
import { getTimer } from "../../template/shim";
import { playerOn } from "../support/playerOn";
import { fcConfig } from "./config";

/** **Validates: Requirements 12.4, 12.5, 12.6** (Property 13: getTimer sums the clock) */
describe("Property 13: getTimer sums the clock", () => {
  it("is non-decreasing and equals the truncated sum of the advances", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5000 }), { maxLength: 30 }), (advances) => {
        const clock = new ManualClock();
        playerOn(clock);
        let sum = 0;
        let prev = getTimer();
        for (const a of advances) {
          clock.advance(a);
          sum += a;
          const now = getTimer();
          if (now < prev || now !== Math.floor(sum)) return false;
          prev = now;
        }
        return true;
      }),
      fcConfig,
    );
  });
});
