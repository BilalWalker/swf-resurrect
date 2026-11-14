import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { svgToShapeJson } from "../../src/convert/svgToShape";
import { type DrawnFills, printShapeJson, validateShapeJson } from "../../template/runtime/shapeJson";
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

// Feature: breadth, Property 3 (order clause): the limits do not depend on attribute or stroke order
describe("svgToShapeJson limit order", () => {
  const head = '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const limited = [
    'stroke="#102030" stroke-linejoin="miter-clip"',
    'stroke="url(#gradient1)"',
    'stroke="#102030" stroke-dasharray="4 2"',
    'stroke="red"',
    'stroke="#102030" stroke-linejoin="arcs"',
  ];
  const build = (items: string[][]): string =>
    `${head}<g transform="matrix(1,0,0,1,0,0)">${items.map((attrs) => `<path ${attrs.join(" ")}/>`).join("")}</g></svg>`;
  /** **Validates: Requirements 2.7, 7.9** */
  it("permuting the attributes, or the order of the elements, gives the same limits", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...limited), { minLength: 1, maxLength: 6 }).chain((specs) =>
          fc.tuple(
            fc.constant(specs),
            fc.array(fc.nat(), { minLength: 6, maxLength: 6 }),
            fc.array(fc.nat(), { minLength: 6, maxLength: 6 }),
          ),
        ),
        ([specs, keysA, keysB]) => {
          const attrsOf = (spec: string): string[] => ['d="M0 0 L9 0 9 9 Z"', 'fill="none"', 'stroke-width="3"', ...spec.split(/ (?=stroke)/)];
          const shuffle = <T>(xs: T[], keys: number[]): T[] =>
            xs.map((x, i) => [x, keys[i % keys.length]! * 31 + i] as const).sort((a, b) => a[1] - b[1]).map(([x]) => x);
          const base = svgToShapeJson(build(specs.map(attrsOf)), "shape").limits;
          const permutedAttrs = svgToShapeJson(build(specs.map((s) => shuffle(attrsOf(s), keysA))), "shape").limits;
          const permutedElements = svgToShapeJson(build(shuffle(specs, keysB).map(attrsOf)), "shape").limits;
          expect(permutedAttrs).toEqual(base);
          expect(permutedElements).toEqual(base);
          const keys = base.map((l) => `${l.kind}\u0000${l.message}`);
          expect(new Set(keys).size).toBe(keys.length);
        },
      ),
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

describe("svgToShapeJson radial gradients", () => {
  const head = '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const ALL: DrawnFills = { gradientLinear: true, gradientRadial: true, bitmap: true };
  const stops = '<stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/>';
  /** **Validates: Requirements 8.3, 8.4, 2.4, 7.9** */
  it("a drawn radial gradient names gradient-spread for a spread other than pad and gradient-focal for a focal point, once each", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom("pad", "reflect", "repeat"), fc.boolean(), fc.constantFrom("radial", "linear")), { minLength: 1, maxLength: 6 }),
        (items) => {
          const defs = items
            .map(([spread, focal, type], i) =>
              type === "radial"
                ? `<radialGradient id="g${i}" cx="0" cy="0" r="819.2" ${focal ? 'fx="100" fy="50"' : ""} spreadMethod="${spread}">${stops}</radialGradient>`
                : `<linearGradient id="g${i}" spreadMethod="${spread}">${stops}</linearGradient>`,
            )
            .join("");
          const body = items.map((_, i) => `<path d="M0 0 L9 0 9 9 Z" fill="url(#g${i})"/>`).join("");
          const { shape, limits } = svgToShapeJson(`${head}<g transform="matrix(1,0,0,1,0,0)">${body}</g><defs>${defs}</defs></svg>`, "shape", ALL);
          expect(shape.paths).toHaveLength(items.length);
          const radials = items.filter(([, , t]) => t === "radial");
          const kinds = limits.map((l) => l.kind);
          expect(kinds.includes("gradient-spread")).toBe(radials.some(([s]) => s !== "pad"));
          expect(kinds.includes("gradient-focal")).toBe(radials.some(([, f]) => f));
          expect(kinds.filter((k) => k !== "gradient-spread" && k !== "gradient-focal")).toEqual([]);
          for (const l of limits.filter((x) => x.kind === "gradient-focal")) expect(l.message.startsWith("approximated: ")).toBe(true);
        },
      ),
      fcConfig,
    );
  });
});

// Feature: breadth, Property 42: Every gradient and bitmap fill is drawn or named exactly once
describe("svgToShapeJson drawn-fill capabilities", () => {
  const capSets: DrawnFills[] = [];
  for (const gradientLinear of [false, true]) for (const gradientRadial of [false, true]) for (const bitmap of [false, true]) capSets.push({ gradientLinear, gradientRadial, bitmap });
  const named = (limits: Array<{ kind: string; message: string }>) => limits.filter((l) => l.kind === "gradient-fill" || l.kind === "bitmap-fill");
  const ordinal = (message: string) => message.replace(/^(gradient|bitmap) fill (\d+) .*$/, "$2");
  /** **Validates: Requirements 2.8, 2.9, 2.4** */
  it("for every capability set, drawn plus named equals the fills of the all-false run, and no fill is both", () => {
    fc.assert(
      fc.property(genFfdecSvg, (svg) => {
        const base = svgToShapeJson(svg, "shape", { gradientLinear: false, gradientRadial: false, bitmap: false });
        expect(base.shape.paths.some((p) => p.fill !== null && p.fill.kind !== "solid")).toBe(false);
        const total = named(base.limits).length;
        const allOrdinals = new Set(named(base.limits).map((l) => ordinal(l.message)));
        expect(allOrdinals.size).toBe(total);
        for (const caps of capSets) {
          const out = svgToShapeJson(svg, "shape", caps);
          const drawn = out.shape.paths.filter((p) => p.fill !== null && p.fill.kind !== "solid");
          const n = named(out.limits);
          expect(drawn.length + n.length).toBe(total);
          for (const p of drawn) {
            const f = p.fill!;
            expect(f.kind === "gradient" ? (f.type === "linear" ? caps.gradientLinear : caps.gradientRadial) : caps.bitmap).toBe(true);
          }
          for (const l of n) expect(allOrdinals.has(ordinal(l.message))).toBe(true);
          expect(new Set(n.map((l) => ordinal(l.message))).size).toBe(n.length);
        }
      }),
      fcConfig,
    );
  });
});

// Feature: breadth, Property 42 with the committed DRAWN_FILLS (sub-task 11.2: only linear gradients are drawn)
describe("svgToShapeJson under the committed DRAWN_FILLS", () => {
  const head = '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const stops = '<stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/>';
  const svgOf = (kind: "linear" | "radial" | "bitmap"): string => {
    const def =
      kind === "linear"
        ? `<linearGradient id="g0">${stops}</linearGradient>`
        : kind === "radial"
          ? `<radialGradient id="g0" cx="0" cy="0" r="819.2">${stops}</radialGradient>`
          : '<pattern id="g0" ffdec:fill-bitmapId="5"><image xlink:href="data:image/PNG;base64,AAAA"/></pattern>';
    return `${head}<g transform="matrix(1,0,0,1,0,0)"><path d="M0 0 L9 0 9 9 Z" fill="url(#g0)"/></g><defs>${def}</defs></svg>`;
  };
  /** **Validates: Requirements 2.8, 8.1** */
  it("a linear or radial gradient produces no limit and a bitmap exactly one bitmap-fill limit", () => {
    const lin = svgToShapeJson(svgOf("linear"), "shape");
    expect(lin.limits).toEqual([]);
    expect(lin.shape.paths).toHaveLength(1);
    expect(lin.shape.paths[0]!.fill!.kind).toBe("gradient");
    const rad = svgToShapeJson(svgOf("radial"), "shape");
    expect(rad.limits.filter((l) => l.kind === "gradient-fill")).toHaveLength(0);
    expect(rad.shape.paths).toHaveLength(1);
    const bmp = svgToShapeJson(svgOf("bitmap"), "shape");
    expect(bmp.limits.filter((l) => l.kind === "bitmap-fill")).toHaveLength(1);
    expect(bmp.shape.paths).toHaveLength(0);
  });
});

// Feature: breadth, Property 19: Bitmap assets are deterministic
// Feature: breadth, Property 4: No part is dropped without a Named_Limit (bitmap-fill, bitmap-smoothing)
describe("svgToShapeJson bitmap assets", () => {
  const head = '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const ALL: DrawnFills = { gradientLinear: true, gradientRadial: true, bitmap: true };
  const b64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));
  const genBitmap = fc.record({
    id: fc.integer({ min: 0, max: 12 }),
    mime: fc.constantFrom("PNG", "png", "JPEG", "jpeg", "jpg"),
    bytes: fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: 40 }),
    rendering: fc.constantFrom("", "image-rendering:optimizeQuality", "image-rendering:optimizeSpeed;image-rendering:pixelated", "image-rendering:crisp-edges"),
  });
  const build = (items: Array<{ id: number; mime: string; bytes: number[]; rendering: string }>): string => {
    const pats = items
      .map((b, i) => `<pattern id="PatternID_1_${i}" ffdec:fill-bitmapId="${b.id}" patternTransform="matrix(0.05, 0, 0, 0.05, ${i}, 0)" style="${b.rendering}"><image xlink:href="data:image/${b.mime};base64,${b64(b.bytes)}"/></pattern>`)
      .join("");
    const paths = items.map((_, i) => `<path d="M0 0 L9 0 9 9 Z" style="fill:url(#PatternID_1_${i})"/>`).join("");
    return `${head}<g transform="matrix(1,0,0,1,0,0)">${pats}${paths}</g></svg>`;
  };

  /** **Validates: Requirements 9.2** */
  it("images are sorted by bitmapId, one per id, carry the decoded bytes, and two builds are identical", () => {
    fc.assert(
      fc.property(fc.array(genBitmap, { minLength: 1, maxLength: 6 }), (items) => {
        const svg = build(items);
        const a = svgToShapeJson(svg, "shape", ALL);
        const b = svgToShapeJson(svg, "shape", ALL);
        expect(b).toEqual(a);
        expect(printShapeJson(b.shape)).toBe(printShapeJson(a.shape));
        const ids = a.images.map((i) => i.bitmapId);
        expect(ids).toEqual([...new Set(items.map((i) => i.id))].sort((x, y) => x - y));
        for (const img of a.images) {
          const first = items.find((i) => i.id === img.bitmapId)!;
          expect(Array.from(img.bytes)).toEqual(first.bytes);
          expect(img.ext).toBe(first.mime.toLowerCase() === "png" ? "png" : "jpg");
        }
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 9.3, 9.4, 7.9, 2.8, 2.9** */
  it("every bitmap fill is drawn or named once, and an unknown image-rendering value is named", () => {
    fc.assert(
      fc.property(fc.array(genBitmap, { minLength: 1, maxLength: 6 }), fc.boolean(), (items, bitmap) => {
        const out = svgToShapeJson(build(items), "shape", { ...ALL, bitmap });
        const fillLimits = out.limits.filter((l) => l.kind === "bitmap-fill");
        if (bitmap) {
          expect(out.shape.paths).toHaveLength(items.length);
          expect(fillLimits).toEqual([]);
          const unknown = items.some((i) => i.rendering === "image-rendering:crisp-edges");
          expect(out.limits.some((l) => l.kind === "bitmap-smoothing")).toBe(unknown);
        } else {
          expect(out.shape.paths).toEqual([]);
          expect(out.images).toEqual([]);
          expect(fillLimits).toHaveLength(items.length);
          expect(out.limits.every((l) => l.kind === "bitmap-fill")).toBe(true);
        }
      }),
      fcConfig,
    );
  });
});
