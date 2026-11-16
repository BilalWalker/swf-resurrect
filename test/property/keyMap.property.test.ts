import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { flashKeyCode, preventsDefault } from "../../template/runtime/keyMap";
import { fcConfig } from "./config";

const CODES: Record<number, string> = {
  13: "Enter", 27: "Escape", 32: "Space", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown",
  65: "KeyA", 67: "KeyC", 68: "KeyD", 83: "KeyS", 87: "KeyW", 88: "KeyX", 90: "KeyZ",
};

// Feature: as3-coverage, Property 3: Key mapping is total and consistent
/** **Validates: Requirements 5.5, 5.8** */
describe("Property 3: Key mapping is total and consistent", () => {
  it("never throws and returns a number or null", () => {
    fc.assert(
      fc.property(
        fc.record({ code: fc.option(fc.string(), { nil: undefined }), keyCode: fc.option(fc.integer({ min: -5, max: 300 }), { nil: undefined }) }),
        (ev) => {
          const r = flashKeyCode(ev);
          return r === null || typeof r === "number";
        },
      ),
      fcConfig,
    );
  });
  it("reaches each of the 14 required codes from some code", () => {
    for (const [flash, code] of Object.entries(CODES)) expect(flashKeyCode({ code })).toBe(Number(flash));
  });
  it("preventsDefault is true exactly for 37 to 40 and 32", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 300 }), (n) => preventsDefault(n) === ((n >= 37 && n <= 40) || n === 32)),
      fcConfig,
    );
  });
});
