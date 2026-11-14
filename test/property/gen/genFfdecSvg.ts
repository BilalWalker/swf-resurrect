import fc from "fast-check";
/**
 * FFDec-style SVG text: the shape wrapper, nested `<g transform>`, `<defs>` glyph groups reached through `<use>`,
 * solid, gradient and pattern fills, strokes with every cap and join spelling. Every number is finite.
 */
const num = fc.integer({ min: -400, max: 400 }).map((n) => n / 2);
const colour = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, "0")}`);
const matrix = fc
  .tuple(fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 }), fc.integer({ min: -3, max: 3 }), num, num)
  .map(([a, b, c, d, e, f]) => `matrix(${a}.0, ${b}.0, ${c}.0, ${d}.0, ${e}, ${f})`);

const rectD = fc.tuple(num, num, fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 100 })).map(
  ([x, y, w, h]) => `M${x} ${y} L${x + w} ${y} ${x + w} ${y + h} ${x} ${y + h} ${x} ${y}`,
);
const curveD = fc.tuple(num, num, num, num, num, num).map(([a, b, c, d, e, f]) => `M${a} ${b} Q${c} ${d} ${e} ${f} C${a} ${c} ${b} ${d} ${e} ${f} Z`);
/** Two nested squares: a hole. */
const ringD = fc.tuple(num, num).map(([x, y]) => `M${x} ${y} L${x + 40} ${y} ${x + 40} ${y + 40} ${x} ${y + 40} Z M${x + 10} ${y + 10} L${x + 10} ${y + 30} ${x + 30} ${y + 30} ${x + 30} ${y + 10} Z`);
const pathD = fc.oneof(rectD, curveD, ringD);

const caps = fc.constantFrom("butt", "round", "square");
const joins = fc.constantFrom("miter", "round", "bevel", "miter-clip");
const stroke = fc
  .tuple(colour, caps, joins, fc.integer({ min: 1, max: 20 }))
  .map(([c, cap, join, w]) => `stroke="${c}" stroke-linecap="${cap}" stroke-linejoin="${join}" stroke-width="${w}.0"`);
const noStroke = fc.constant('stroke="none"');

/** A fill paint: solid (the common case), an unresolved url, or a reference to a gradient or pattern of the shape. */
const paint = fc.oneof(
  { arbitrary: colour.map((c) => `fill="${c}"`), weight: 5 },
  { arbitrary: fc.constant('fill="url(#gradient1)"'), weight: 1 },
  { arbitrary: fc.constant('fill="url(#gradient2)"'), weight: 1 },
  { arbitrary: fc.constant('style="fill:url(#PatternID_1_1)"'), weight: 1 },
  { arbitrary: fc.constant('fill="url(#missing)"'), weight: 1 },
  { arbitrary: fc.constant('fill="none"'), weight: 1 },
);

const pathEl = fc
  .tuple(pathD, paint, fc.oneof(stroke, noStroke), fc.integer({ min: 0, max: 100 }))
  .map(([d, p, s, op]) => `<path d="${d}" ${p} fill-opacity="${op / 100}" fill-rule="evenodd" ${s}/>`);

const useEl = fc
  .tuple(fc.constantFrom("glyph_a", "glyph_b", "absent"), matrix, paint)
  .map(([id, m, p]) => `<use xlink:href="#${id}" transform="${m}" ${p}/>`);

const nested = (inner: fc.Arbitrary<string>): fc.Arbitrary<string> =>
  fc.tuple(matrix, fc.array(inner, { maxLength: 3 })).map(([m, kids]) => `<g transform="${m}">${kids.join("")}</g>`);

const element: fc.Arbitrary<string> = fc.letrec((tie) => ({
  leaf: fc.oneof(pathEl, useEl),
  tree: fc.oneof({ arbitrary: tie("leaf") as fc.Arbitrary<string>, weight: 3 }, { arbitrary: nested(tie("leaf") as fc.Arbitrary<string>), weight: 1 }),
})).tree;

const defs = [
  "<defs>",
  '<g id="glyph_a"><path d="M0 0 L10 0 10 10 0 10 Z"/></g>',
  '<g id="glyph_b"><path d="M0 0 L5 0 5 5 0 5 Z M1 1 L1 4 4 4 4 1 Z" fill="#102030"/></g>',
  '<linearGradient id="gradient1" gradientUnits="userSpaceOnUse" x1="-819.2" x2="819.2" gradientTransform="matrix(0.01, 0, 0, 0.01, 0, 0)" spreadMethod="pad"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff" stop-opacity="0.5"/></linearGradient>',
  '<radialGradient id="gradient2" cx="0" cy="0" r="819.2" spreadMethod="reflect"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#888888"/><stop offset="1" stop-color="#000000"/></radialGradient>',
  "</defs>",
].join("");

const pattern = '<pattern id="PatternID_1_1" ffdec:fill-bitmapId="5" patternTransform="matrix(1, 0, 0, 1, 0, 0)"><image width="4" height="4" xlink:href="data:image/PNG;base64,AAAA"/></pattern>';

export const genFfdecSvg: fc.Arbitrary<string> = fc
  .tuple(fc.boolean(), fc.boolean(), num, num, fc.array(element, { maxLength: 6 }))
  .map(
    ([withDefs, withWrapper, tx, ty, els]) =>
      `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" ffdec:objectType="shape" height="81.0px" width="85.0px" xmlns="http://www.w3.org/2000/svg">` +
      `${withDefs ? defs : ""}` +
      (withWrapper ? `<g transform="matrix(1.0, 0.0, 0.0, 1.0, ${tx}, ${ty})">${pattern}${els.join("")}</g>` : `${pattern}${els.join("")}`) +
      `</svg>`,
  );

/** Arbitrary text, including malformed XML: the Shape_Function is total. */
export const genAnyText: fc.Arbitrary<string> = fc.oneof(fc.string({ maxLength: 80 }), genFfdecSvg.map((s) => s.slice(0, Math.max(0, s.length - 7))));
