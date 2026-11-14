import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { svgToShapeJson } from "../../src/convert/svgToShape";
import { validateShapeJson } from "../../template/runtime/shapeJson";

const fixture = (sample: string, id: number): string => readFileSync(`test/fixtures/${sample}/shapes/${id}.svg`, "utf8");

describe("svgToShapeJson on the clickgoto and tweendemo fixtures", () => {
  for (const sample of ["clickgoto", "tweendemo"]) {
    for (const id of [1, 2, 4, 5]) {
      it(`${sample} shape ${id}: one solid rectangle, wrapper not applied, no limit`, () => {
        const svg = fixture(sample, id);
        const { shape, images, limits } = svgToShapeJson(svg, "shape");
        validateShapeJson(shape);
        expect(images).toEqual([]);
        expect(limits).toEqual([]);
        expect(shape.paths).toHaveLength(1);
        const p = shape.paths[0]!;
        const fill = /<path d="([^"]*)" fill="(#[0-9a-f]{6})"/.exec(svg)!;
        expect(p.fill).toEqual({ kind: "solid", color: fill[2], alpha: 1 });
        expect(p.contours).toHaveLength(1);
        expect(p.contours[0]!.holes).toEqual([]);
        // The coordinates are those of the path data: the wrapper translation is not added.
        const nums = fill[1]!.match(/-?[0-9.]+/g)!.map(Number);
        expect(p.contours[0]!.outer[0]).toEqual(["M", nums[0], nums[1]]);
      });
    }
  }
});

describe("svgToShapeJson on synthetic input", () => {
  const head =
    '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';

  it("resolves <use> to a <g id> in <defs>, composes transforms and takes the fill from the <use>", () => {
    const svg =
      head +
      '<defs><g id="font_1_M0"><path d="M0 0 L10 0 10 10 0 10 Z"/></g></defs>' +
      '<g transform="matrix(1.0, 0.0, 0.0, 1.0, 100.0, 50.0)">' +
      '<g transform="matrix(2.0, 0.0, 0.0, 2.0, 0.0, 0.0)">' +
      '<use xlink:href="#font_1_M0" transform="matrix(1, 0, 0, 1, 5, 7)" fill="#ff0000" fill-opacity="0.5"/>' +
      "</g></g></svg>";
    const { shape, limits } = svgToShapeJson(svg, "text");
    expect(limits).toEqual([]);
    expect(shape.paths).toHaveLength(1);
    expect(shape.paths[0]!.fill).toEqual({ kind: "solid", color: "#ff0000", alpha: 0.5 });
    // outer scale 2 after the use translation (5, 7): x' = 2 * (x + 5), y' = 2 * (y + 7); the wrapper is not applied.
    expect(shape.paths[0]!.contours[0]!.outer).toEqual([
      ["M", 10, 14],
      ["L", 30, 14],
      ["L", 30, 34],
      ["L", 10, 34],
      ["Z"],
    ]);
  });

  it("makes a hole from a nested subpath and keeps SVG order of elements", () => {
    const svg =
      head +
      '<g transform="matrix(1,0,0,1,0,0)">' +
      '<path d="M0 0 L40 0 40 40 0 40 Z M10 10 L10 30 30 30 30 10 Z" fill="#000001" fill-rule="evenodd"/>' +
      '<path d="M50 0 L60 0 60 10 50 10 Z" fill="#000002"/>' +
      "</g></svg>";
    const { shape } = svgToShapeJson(svg, "shape");
    expect(shape.paths.map((p) => p.fill)).toEqual([
      { kind: "solid", color: "#000001", alpha: 1 },
      { kind: "solid", color: "#000002", alpha: 1 },
    ]);
    expect(shape.paths[0]!.contours).toHaveLength(1);
    expect(shape.paths[0]!.contours[0]!.holes).toHaveLength(1);
  });

  it("returns one numbered Named_Limit per gradient or bitmap fill and leaves the fill out", () => {
    const svg =
      head +
      '<g transform="matrix(1,0,0,1,0,0)">' +
      '<linearGradient id="gradient1"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient>' +
      '<pattern id="PatternID_9_1" ffdec:fill-bitmapId="5"><image xlink:href="data:image/PNG;base64,AAAA"/></pattern>' +
      '<path d="M0 0 L9 0 9 9 Z" fill="url(#gradient1)"/>' +
      '<path d="M0 0 L9 0 9 9 Z" style="fill:url(#PatternID_9_1)"/>' +
      '<path d="M0 0 L9 0 9 9 Z" fill="#123456"/>' +
      "</g></svg>";
    const { shape, limits } = svgToShapeJson(svg, "shape");
    expect(shape.paths).toHaveLength(1);
    expect(limits).toEqual([
      { kind: "bitmap-fill", message: "bitmap fill 2 is not drawn (image 5)" },
      { kind: "gradient-fill", message: "gradient fill 1 is not drawn (linear, 2 stops)" },
    ]);
  });

  it("returns an empty Shape_JSON for text that is not an SVG", () => {
    expect(svgToShapeJson("not xml <<", "shape")).toEqual({ shape: { formatVersion: 1, paths: [] }, images: [], limits: [] });
  });
});
