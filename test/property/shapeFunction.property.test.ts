import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { svgToShapeJson } from "../../src/convert/svgToShape";
import { printShapeJson, validateShapeJson } from "../../template/runtime/shapeJson";
import { fcConfig } from "./config";
import { genAnyText, genFfdecSvg } from "./gen/genFfdecSvg";
// Idempotence (Requirement 7.8) does not apply to the Shape_Function: its output form (Shape_JSON) differs from its
// input form (SVG), so there is nothing to feed back in. Determinism, totality and validity are what is checked here.

// Feature: breadth, Property 3: The Shape_Function is deterministic, total and valid
describe("svgToShapeJson", () => {
  /** **Validates: Requirements 7.7, 7.9, 2.7** */
  it("two calls are equal, never throw, give a valid Shape_JSON and sorted, distinct limits", () => {
    fc.assert(
      fc.property(genFfdecSvg, fc.constantFrom("shape" as const, "text" as const), (svg, kind) => {
        const a = svgToShapeJson(svg, kind);
        const b = svgToShapeJson(svg, kind);
        expect(b).toEqual(a);
        expect(printShapeJson(b.shape)).toBe(printShapeJson(a.shape));
        expect(() => validateShapeJson(a.shape)).not.toThrow();
        expect(printShapeJson(a.shape)).not.toContain("-0,");
        for (let i = 1; i < a.limits.length; i++) {
          const p = a.limits[i - 1]!;
          const q = a.limits[i]!;
          const order = p.kind === q.kind ? (p.message < q.message ? -1 : p.message > q.message ? 1 : 0) : p.kind < q.kind ? -1 : 1;
          expect(order, `${p.kind} ${p.message} / ${q.kind} ${q.message}`).toBe(-1);
        }
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 7.7, 7.9** */
  it("is total on arbitrary and truncated text", () => {
    fc.assert(
      fc.property(genAnyText, (text) => {
        const out = svgToShapeJson(text, "shape");
        expect(() => validateShapeJson(out.shape)).not.toThrow();
      }),
      fcConfig,
    );
  });
});
