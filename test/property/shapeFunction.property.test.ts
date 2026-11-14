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

// Feature: breadth, Property 4: No part is dropped without a Named_Limit
describe("svgToShapeJson strokes", () => {
  const head = '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const variants = [
    { attrs: 'stroke="#102030"', limit: null },
    { attrs: 'stroke="#102030" stroke-linejoin="miter-clip"', limit: "approximated: miter-clip join is drawn as miter" },
    { attrs: 'stroke="url(#gradient1)"', limit: "gradient stroke is not drawn" },
    { attrs: 'stroke="#102030" stroke-dasharray="4 2"', limit: "approximated: dash array is not drawn, the stroke is solid" },
    { attrs: 'stroke="red"', limit: "stroke paint is not resolved and is not drawn" },
  ] as const;
  const dropped = (attrs: string): boolean => attrs.includes("url(") || attrs.includes("red");
  /** **Validates: Requirements 13.8, 13.9, 13.11, 2.1, 2.5, 2.6, 7.9** */
  it("every stroke is kept or named by a stroke-style limit, and a plain stroke names nothing", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...variants), fc.constantFrom("butt", "round", "square"), fc.constantFrom("miter", "round", "bevel")), {
          minLength: 1,
          maxLength: 6,
        }),
        (items) => {
          const els = items
            .map(([v, cap, join]) => {
              const a = v.attrs.includes("stroke-linejoin") ? v.attrs : `${v.attrs} stroke-linejoin="${join}"`;
              return `<path d="M0 0 L9 0 9 9 Z" fill="none" ${a} stroke-linecap="${cap}" stroke-width="3"/>`;
            })
            .join("");
          const { shape, limits } = svgToShapeJson(`${head}<g transform="matrix(1,0,0,1,0,0)">${els}</g></svg>`, "shape");
          expect(() => validateShapeJson(shape)).not.toThrow();
          const kept = items.filter(([v]) => !dropped(v.attrs)).length;
          expect(shape.paths.filter((p) => p.stroke !== null)).toHaveLength(kept);
          expect(shape.paths).toHaveLength(kept);
          const messages = limits.filter((l) => l.kind === "stroke-style").map((l) => l.message);
          expect(limits.every((l) => l.kind === "stroke-style")).toBe(true);
          const expected = [...new Set(items.flatMap(([v]) => (v.limit === null ? [] : [v.limit])))].sort();
          expect(messages).toEqual(expected);
        },
      ),
      fcConfig,
    );
  });
});