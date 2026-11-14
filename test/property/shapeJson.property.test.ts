import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseShapeJson, printShapeJson, ShapeJsonError, validateShapeJson } from "../../template/runtime/shapeJson";
import { fcConfig } from "./config";
import { corruptionsOf, genShapeJson } from "./gen/genShapeJson";

// Feature: breadth, Property 1: Shape_JSON round trip
describe("Shape_JSON round trip", () => {
  /** **Validates: Requirements 7.10** */
  it("parseShapeJson(printShapeJson(x)) equals x, and printing the result gives the first text", () => {
    fc.assert(
      fc.property(genShapeJson, (x) => {
        const text = printShapeJson(x);
        const back = parseShapeJson(text);
        expect(back).toEqual(x);
        expect(printShapeJson(back)).toBe(text);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 7.10** */
  it("the generated values are valid and print no -0", () => {
    fc.assert(
      fc.property(genShapeJson, (x) => {
        expect(() => validateShapeJson(x)).not.toThrow();
        expect(printShapeJson(x)).not.toContain("-0,");
      }),
      fcConfig,
    );
  });
});

// Feature: breadth, Property 2: The validator names the failing field
describe("validateShapeJson names the failing field", () => {
  /** **Validates: Requirements 7.7** */
  it("a single corruption throws ShapeJsonError whose message starts with the corrupted path", () => {
    fc.assert(
      fc.property(genShapeJson, fc.nat(), (x, pick) => {
        const all = corruptionsOf(x);
        const c = all[pick % all.length]!;
        const copy = structuredClone(x);
        c.apply(copy);
        let caught: unknown;
        try {
          validateShapeJson(copy);
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(ShapeJsonError);
        expect((caught as ShapeJsonError).message.startsWith(`${c.path}: `), (caught as ShapeJsonError).message).toBe(true);
      }),
      fcConfig,
    );
  });
});
