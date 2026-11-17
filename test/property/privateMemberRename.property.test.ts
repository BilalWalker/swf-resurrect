import fc from "fast-check";
import { describe, it } from "vitest";
import { chainSource, translateAndRun } from "../support/privateChain";

describe("Property: private members are per class", () => {
  /**
   * **Validates: Requirements 37.1**
   * In a generated chain of classes whose private names collide, each class reads back its own value
   * through its own methods.
   */
  it("each class of a chain reads back its own privates", () => {
    const names = ["lv", "w", "q"];
    fc.assert(
      fc.property(
        fc.array(fc.uniqueArray(fc.constantFrom(...names), { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 4 }),
        (sets) => {
          const sources = sets.map((s, k) => chainSource(k, s, k === 0 ? null : `C${k - 1}`));
          const { classes } = translateAndRun(sources);
          const obj = new classes[`C${sets.length - 1}`]();
          return sets.every((s, k) => obj[`read${k}`]() === s.reduce((a, _f, i) => a + (k + 1) * 10 + i, 0));
        },
      ),
      { numRuns: 25 },
    );
  });
});
