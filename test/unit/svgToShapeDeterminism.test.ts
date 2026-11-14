import { describe, expect, it } from "vitest";
import { svgToShapeJson } from "../../src/convert/svgToShape";
import { printShapeJson } from "../../template/runtime/shapeJson";

const ALL = { gradientLinear: true, gradientRadial: true, bitmap: true };
const head =
  '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
const svg =
  head +
  '<g transform="matrix(1,0,0,1,4,5)">' +
  '<pattern id="PatternID_3_2" ffdec:fill-bitmapId="9" patternTransform="matrix(0.05, 0, 0, 0.05, 0, 0)"><image xlink:href="data:image/JPEG;base64,/9j/4AAQ"/></pattern>' +
  '<pattern id="PatternID_3_1" ffdec:fill-bitmapId="2" patternTransform="matrix(0.05, 0, 0, 0.05, 1, 1)" style="image-rendering:optimizeSpeed;image-rendering:pixelated"><image xlink:href="data:image/PNG;base64,iVBORw0KGgo="/></pattern>' +
  '<path d="M0 0 L9 0 9 9 Z" style="fill:url(#PatternID_3_2)"/>' +
  '<path d="M0 0 L9 0 9 9 Z" style="fill:url(#PatternID_3_1)"/>' +
  "</g></svg>";

describe("svgToShapeJson determinism with bitmap patterns", () => {
  it("two runs give byte-identical printed Shape_JSON and image bytes", () => {
    const a = svgToShapeJson(svg, "shape", ALL);
    const b = svgToShapeJson(svg, "shape", ALL);
    expect(printShapeJson(b.shape)).toBe(printShapeJson(a.shape));
    expect(a.images.map((i) => i.bitmapId)).toEqual([2, 9]);
    expect(b.images.map((i) => [i.bitmapId, i.ext, Array.from(i.bytes)])).toEqual(a.images.map((i) => [i.bitmapId, i.ext, Array.from(i.bytes)]));
    expect(Array.from(a.images[0]!.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(Array.from(a.images[1]!.bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    expect(a.limits).toEqual(b.limits);
  });
});
