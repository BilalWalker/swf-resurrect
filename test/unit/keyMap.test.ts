import { describe, expect, it } from "vitest";
import { flashKeyCode, preventsDefault } from "../../template/runtime/keyMap";

// as3-coverage 8.1, Requirement 5.8: one example per key code the two games read.
const REQUIRED: ReadonlyArray<[number, string]> = [
  [13, "Enter"],
  [27, "Escape"],
  [32, "Space"],
  [37, "ArrowLeft"],
  [38, "ArrowUp"],
  [39, "ArrowRight"],
  [40, "ArrowDown"],
  [65, "KeyA"],
  [67, "KeyC"],
  [68, "KeyD"],
  [83, "KeyS"],
  [87, "KeyW"],
  [88, "KeyX"],
  [90, "KeyZ"],
];

describe("flashKeyCode", () => {
  for (const [flash, code] of REQUIRED) {
    it(`maps ${code} to ${flash}`, () => {
      expect(flashKeyCode({ code })).toBe(flash);
    });
  }
  it("maps digits to 48..57", () => {
    expect(flashKeyCode({ code: "Digit0" })).toBe(48);
    expect(flashKeyCode({ code: "Digit9" })).toBe(57);
  });
  it("reads code before keyCode", () => {
    expect(flashKeyCode({ code: "KeyA", keyCode: 81 })).toBe(65);
  });
  it("falls back to keyCode for an unknown code, else null", () => {
    expect(flashKeyCode({ code: "F5", keyCode: 116 })).toBe(116);
    expect(flashKeyCode({ code: "F5" })).toBeNull();
    expect(flashKeyCode({ code: "", keyCode: 0 })).toBeNull();
  });
});

describe("preventsDefault", () => {
  it("is true for the arrows and space only among the required codes", () => {
    for (const [flash] of REQUIRED) expect(preventsDefault(flash)).toBe([32, 37, 38, 39, 40].includes(flash));
  });
});
describe("flashKeyCode with Object.prototype names", () => {
  it("does not read inherited properties as key codes", () => {
    for (const code of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(flashKeyCode({ code })).toBeNull();
      expect(flashKeyCode({ code, keyCode: 7 })).toBe(7);
    }
  });
});
