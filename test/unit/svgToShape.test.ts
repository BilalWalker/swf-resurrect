import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { svgToShapeJson } from "../../src/convert/svgToShape";
import { validateShapeJson } from "../../template/runtime/shapeJson";
/** The capability set that draws nothing: the committed DRAWN_FILLS draws linear gradients since 11.2. */
const NO_FILLS = { gradientLinear: false, gradientRadial: false, bitmap: false };

const fixture = (sample: string, id: number): string => readFileSync(`test/fixtures/${sample}/shapes/${id}.svg`, "utf8");

describe("svgToShapeJson on the clickgoto and tweendemo fixtures", () => {
  for (const sample of ["clickgoto", "tweendemo"]) {
    for (const id of [1, 2, 4, 5]) {
      it(`${sample} shape ${id}: a solid rectangle and its outline, wrapper not applied, no limit`, () => {
        const svg = fixture(sample, id);
        const { shape, images, limits } = svgToShapeJson(svg, "shape");
        validateShapeJson(shape);
        expect(images).toEqual([]);
        expect(limits).toEqual([]);
        const outline = /stroke="(#[0-9a-f]{6})" stroke-linecap="(\w+)" stroke-linejoin="(\w+)" stroke-width="([0-9.]+)"/.exec(svg);
        expect(shape.paths).toHaveLength(outline === null ? 1 : 2);
        if (outline !== null) {
          // FFDec writes the outline as its own element: the builder keeps it as a second, stroke-only path.
          expect(shape.paths[1]!.fill).toBeNull();
          expect(shape.paths[1]!.stroke).toEqual({
            color: outline[1],
            alpha: 1,
            width: Number(outline[4]),
            cap: outline[2],
            join: outline[3],
            miterLimit: 4,
          });
        }
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
    const { shape, limits } = svgToShapeJson(svg, "shape", NO_FILLS);
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

describe("svgToShapeJson strokes", () => {
  const head =
    '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const one = (attrs: string, wrapped = '<g transform="matrix(1,0,0,1,0,0)">') =>
    svgToShapeJson(`${head}${wrapped}<path d="M0 0 L10 0 10 10" fill="none" ${attrs}/></g></svg>`, "shape");

  for (const cap of ["butt", "round", "square"] as const) {
    it(`maps stroke-linecap ${cap} and records no limit`, () => {
      const { shape, limits } = one(`stroke="#ff0000" stroke-width="4" stroke-linecap="${cap}"`);
      expect(limits).toEqual([]);
      expect(shape.paths[0]!.stroke).toEqual({ color: "#ff0000", alpha: 1, width: 4, cap, join: "miter", miterLimit: 4 });
      expect(shape.paths[0]!.fill).toBeNull();
    });
  }
  for (const join of ["miter", "round", "bevel"] as const) {
    it(`maps stroke-linejoin ${join} and records no limit`, () => {
      const { shape, limits } = one(`stroke="#00ff00" stroke-linejoin="${join}" stroke-miterlimit="2.5"`);
      expect(limits).toEqual([]);
      expect(shape.paths[0]!.stroke).toMatchObject({ join, miterLimit: 2.5, cap: "butt", width: 1 });
    });
  }
  it("writes every cap and join spelling to ShapeStroke with miterLimit always set (11.1)", () => {
    for (const cap of ["butt", "round", "square"] as const) {
      for (const join of ["miter", "round", "bevel"] as const) {
        const { shape, limits } = one(`stroke="#000000" stroke-width="10" stroke-linecap="${cap}" stroke-linejoin="${join}"`);
        expect(limits).toEqual([]);
        expect(shape.paths[0]!.stroke).toEqual({ color: "#000000", alpha: 1, width: 10, cap, join, miterLimit: 4 });
      }
    }
  });
  it("maps miter-clip to miter and records one approximated stroke-style limit", () => {
    const { shape, limits } = one('stroke="#000000" stroke-linejoin="miter-clip" stroke-miterlimit="2.0"');
    expect(shape.paths[0]!.stroke).toMatchObject({ join: "miter", miterLimit: 2 });
    expect(limits).toEqual([{ kind: "stroke-style", message: "approximated: miter-clip join is drawn as miter" }]);
  });
  it("writes the SVG default miter limit 4 and reads stroke-opacity", () => {
    const { shape } = one('stroke="#abc" stroke-opacity="0.25"');
    expect(shape.paths[0]!.stroke).toMatchObject({ color: "#aabbcc", alpha: 0.25, miterLimit: 4 });
  });
  it("keeps a gradient stroke as no stroke with a limit, and a dash array as a solid stroke with a limit", () => {
    const g = one('stroke="url(#gradient1)"');
    expect(g.shape.paths).toEqual([]);
    expect(g.limits).toEqual([{ kind: "stroke-style", message: "gradient stroke is not drawn" }]);
    const d = one('stroke="#000000" stroke-dasharray="3 1"');
    expect(d.shape.paths[0]!.stroke).not.toBeNull();
    expect(d.limits.map((l) => l.kind)).toEqual(["stroke-style"]);
  });
  it("gives a path with a fill and a stroke one ShapePath with both, and scales the width by the baked matrix", () => {
    const svg =
      head +
      '<g transform="matrix(1,0,0,1,5,5)"><g transform="matrix(2,0,0,2,0,0)">' +
      '<path d="M0 0 L9 0 9 9 Z" fill="#112233" stroke="#445566" stroke-width="3"/></g></g></svg>';
    const { shape } = svgToShapeJson(svg, "shape");
    expect(shape.paths).toHaveLength(1);
    expect(shape.paths[0]!.fill).toMatchObject({ kind: "solid", color: "#112233" });
    expect(shape.paths[0]!.stroke).toMatchObject({ color: "#445566", width: 6 });
  });
  it("keeps the stroke of a path whose gradient fill is not drawn", () => {
    const svg =
      head +
      '<g transform="matrix(1,0,0,1,0,0)"><linearGradient id="gradient1"><stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/></linearGradient>' +
      '<path d="M0 0 L9 0 9 9 Z" fill="url(#gradient1)" stroke="#010203"/></g></svg>';
    const { shape, limits } = svgToShapeJson(svg, "shape", NO_FILLS);
    expect(shape.paths).toHaveLength(1);
    expect(shape.paths[0]!.fill).toBeNull();
    expect(shape.paths[0]!.stroke).toMatchObject({ color: "#010203" });
    expect(limits.map((l) => l.kind)).toEqual(["gradient-fill"]);
  });
});

describe("svgToShapeJson gradients", () => {
  const head =
    '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const ALL = { gradientLinear: true, gradientRadial: true, bitmap: true };
  const NONE = { gradientLinear: false, gradientRadial: false, bitmap: false };
  const doc = (defs: string, body: string) =>
    `${head}<g transform="matrix(1.0, 0.0, 0.0, 1.0, 5.0, 6.0)">${body}</g><defs>${defs}</defs></svg>`;
  const stops3 =
    '<stop offset="0.0" stop-color="#ff0000" stop-opacity="0.5"/><stop offset="0.5" stop-color="#00ff00"/><stop offset="1.0" stop-color="#0000ff"/>';
  const linear = (spread: string) =>
    `<linearGradient gradientTransform="matrix(0.0, -0.0079, 0.0079, 0.0, 1.5, 6.5)" gradientUnits="userSpaceOnUse" id="gradient0" spreadMethod="${spread}" x1="-819.2" x2="819.2">${stops3}</linearGradient>`;
  const radial = (spread: string, focal: string) =>
    `<radialGradient cx="0" cy="0" ${focal} gradientTransform="matrix(0.02, 0.0, 0.0, 0.02, 40.0, 30.0)" gradientUnits="userSpaceOnUse" id="gradient0" r="819.2" spreadMethod="${spread}">${stops3}</radialGradient>`;
  const body = '<path d="M0 0 L9 0 9 9 Z" fill="url(#gradient0)" fill-rule="evenodd" stroke="none"/>';

  it("converts a linear gradient: matrix, spread, stop alpha (absent is 1) and no focal", () => {
    const { shape, limits } = svgToShapeJson(doc(linear("pad"), body), "shape", ALL);
    validateShapeJson(shape);
    expect(limits).toEqual([]);
    expect(shape.paths).toHaveLength(1);
    expect(shape.paths[0]!.fill).toEqual({
      kind: "gradient",
      type: "linear",
      matrix: [0, -0.0079, 0.0079, 0, 1.5, 6.5],
      stops: [
        { offset: 0, color: "#ff0000", alpha: 0.5 },
        { offset: 0.5, color: "#00ff00", alpha: 1 },
        { offset: 1, color: "#0000ff", alpha: 1 },
      ],
      spread: "pad",
    });
  });

  it("keeps a linear gradient with reflect or repeat and records nothing", () => {
    for (const spread of ["reflect", "repeat"] as const) {
      const { shape, limits } = svgToShapeJson(doc(linear(spread), body), "shape", ALL);
      expect(limits).toEqual([]);
      expect(shape.paths[0]!.fill).toMatchObject({ kind: "gradient", type: "linear", spread });
    }
  });

  it("converts a radial gradient and records nothing for pad without a focal point", () => {
    const { shape, limits } = svgToShapeJson(doc(radial("pad", ""), body), "shape", ALL);
    expect(limits).toEqual([]);
    expect(shape.paths[0]!.fill).toMatchObject({ kind: "gradient", type: "radial", spread: "pad" });
    expect((shape.paths[0]!.fill as { focal?: unknown }).focal).toBeUndefined();
    expect(shape.paths[0]!.fill).toMatchObject({ matrix: [0.02, 0, 0, 0.02, 40, 30] });
  });

  it("a radial gradient with another spread records gradient-spread and is kept", () => {
    const { shape, limits } = svgToShapeJson(doc(radial("reflect", ""), body), "shape", ALL);
    expect(shape.paths).toHaveLength(1);
    expect(limits).toEqual([
      { kind: "gradient-spread", message: "radial gradient with spreadMethod reflect is not drawn" },
    ]);
  });

  it("a radial gradient with a focal point records an approximated gradient-focal and keeps the focal point", () => {
    const { shape, limits } = svgToShapeJson(doc(radial("pad", 'fx="300.5" fy="-20"'), body), "shape", ALL);
    expect(shape.paths[0]!.fill).toMatchObject({ focal: { x: 300.5, y: -20 } });
    expect(limits).toHaveLength(1);
    expect(limits[0]!.kind).toBe("gradient-focal");
    expect(limits[0]!.message.startsWith("approximated: ")).toBe(true);
  });

  it("a focal point on the centre is not a focal point", () => {
    const { shape, limits } = svgToShapeJson(doc(radial("pad", 'fx="0" fy="0"'), body), "shape", ALL);
    expect(limits).toEqual([]);
    expect((shape.paths[0]!.fill as { focal?: unknown }).focal).toBeUndefined();
  });

  it("with the default all-false caps every gradient is left out and named once", () => {
    const two = body + body.replace("M0 0", "M1 1");
    for (const caps of [NONE]) {
      const { shape, limits } = svgToShapeJson(doc(linear("pad"), two), "shape", caps);
      expect(shape.paths).toEqual([]);
      expect(limits).toEqual([
        { kind: "gradient-fill", message: "gradient fill 1 is not drawn (linear, 3 stops)" },
        { kind: "gradient-fill", message: "gradient fill 2 is not drawn (linear, 3 stops)" },
      ]);
    }
  });

  it("the flag decides by gradient type, and the ordinal counts drawn fills too", () => {
    const defs = linear("pad") + radial("pad", "").replace('id="gradient0"', 'id="gradient1"');
    const two = body + body.replace("gradient0", "gradient1");
    const lin = svgToShapeJson(doc(defs, two), "shape", { ...NONE, gradientLinear: true });
    expect(lin.shape.paths).toHaveLength(1);
    expect(lin.shape.paths[0]!.fill).toMatchObject({ type: "linear" });
    expect(lin.limits).toEqual([{ kind: "gradient-fill", message: "gradient fill 2 is not drawn (radial, 3 stops)" }]);
    const rad = svgToShapeJson(doc(defs, two), "shape", { ...NONE, gradientRadial: true });
    expect(rad.shape.paths[0]!.fill).toMatchObject({ type: "radial" });
    expect(rad.limits).toEqual([{ kind: "gradient-fill", message: "gradient fill 1 is not drawn (linear, 3 stops)" }]);
  });

  it("an undrawn gradient fill on a path with a stroke keeps the stroke", () => {
    const withStroke = '<path d="M0 0 L9 0 9 9 Z" fill="url(#gradient0)" stroke="#010203" stroke-width="2"/>';
    const { shape, limits } = svgToShapeJson(doc(linear("pad"), withStroke), "shape", NO_FILLS);
    expect(shape.paths).toHaveLength(1);
    expect(shape.paths[0]!.fill).toBeNull();
    expect(shape.paths[0]!.stroke).toMatchObject({ color: "#010203" });
    expect(limits.map((l) => l.kind)).toEqual(["gradient-fill"]);
  });

  it("a gradient with fewer than two stops is named, not drawn", () => {
    const one = '<linearGradient id="gradient0"><stop offset="0" stop-color="#000000"/></linearGradient>';
    const { shape, limits } = svgToShapeJson(doc(one, body), "shape", ALL);
    expect(shape.paths).toEqual([]);
    expect(limits.map((l) => l.kind)).toEqual(["gradient-fill"]);
  });
});

describe("svgToShapeJson bitmap fills", () => {
  const head =
    '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const ALL = { gradientLinear: true, gradientRadial: true, bitmap: true };
  // "AQID" is the bytes 1, 2, 3.
  const pattern = (id: number, href: string, extra = "", tf = 'patternTransform="matrix(0.05, 0, 0, 0.05, 2, 3)"') =>
    `<pattern id="PatternID_9_${id}" ffdec:fill-bitmapId="${id}" ${tf} ${extra}><image xlink:href="${href}"/></pattern>`;
  const doc = (inner: string, pathAttrs = 'style="fill:url(#PatternID_9_5)"') =>
    `${head}<g transform="matrix(1,0,0,1,0,0)">${inner}<path d="M0 0 L9 0 9 9 Z" ${pathAttrs}/></g></svg>`;

  it("builds a bitmap fill with the baked pattern matrix, the image path and decoded bytes", () => {
    const { shape, images, limits } = svgToShapeJson(doc(pattern(5, "data:image/PNG;base64,AQID")), "shape", ALL);
    expect(limits).toEqual([]);
    expect(shape.paths[0]!.fill).toEqual({ kind: "bitmap", image: "images/5.png", matrix: [0.05, 0, 0, 0.05, 2, 3], smooth: true });
    expect(images).toEqual([{ bitmapId: 5, ext: "png", bytes: new Uint8Array([1, 2, 3]) }]);
  });

  for (const mime of ["jpeg", "jpg", "JPEG"]) {
    it(`maps mime ${mime} to jpg`, () => {
      const { shape, images } = svgToShapeJson(doc(pattern(5, `data:image/${mime};base64,AQID`)), "shape", ALL);
      expect(shape.paths[0]!.fill).toMatchObject({ image: "images/5.jpg" });
      expect(images[0]!.ext).toBe("jpg");
    });
  }

  const smoothing: Array<[string, boolean]> = [
    ["image-rendering:optimizeSpeed;image-rendering:pixelated", false],
    ["image-rendering:pixelated", false],
    ["image-rendering:optimizeQuality", true],
  ];
  for (const [style, smooth] of smoothing) {
    it(`reads ${style} as smooth ${smooth} without a limit`, () => {
      const { shape, limits } = svgToShapeJson(doc(pattern(5, "data:image/PNG;base64,AQID", `style="${style}"`)), "shape", ALL);
      expect(shape.paths[0]!.fill).toMatchObject({ smooth });
      expect(limits).toEqual([]);
    });
  }

  it("draws a bitmap with any other image-rendering value smoothed and records bitmap-smoothing", () => {
    const { shape, limits } = svgToShapeJson(doc(pattern(5, "data:image/PNG;base64,AQID", 'style="image-rendering:crisp-edges"')), "shape", ALL);
    expect(shape.paths[0]!.fill).toMatchObject({ smooth: true });
    expect(limits.map((l) => l.kind)).toEqual(["bitmap-smoothing"]);
  });

  it("returns exactly one bitmap-fill limit and no image when caps.bitmap is false", () => {
    const { shape, images, limits } = svgToShapeJson(doc(pattern(5, "data:image/PNG;base64,AQID")), "shape", { ...ALL, bitmap: false });
    expect(shape.paths).toEqual([]);
    expect(images).toEqual([]);
    expect(limits).toEqual([{ kind: "bitmap-fill", message: "bitmap fill 1 is not drawn (image 5)" }]);
  });

  it("names a pattern that is missing, has no readable bytes or has an unknown mime", () => {
    for (const inner of ["", pattern(5, "data:image/PNG;base64,"), pattern(5, "data:image/gif;base64,AQID"), pattern(5, "http://x/y.png")]) {
      const { shape, images, limits } = svgToShapeJson(doc(inner), "shape", ALL);
      expect(shape.paths).toEqual([]);
      expect(images).toEqual([]);
      expect(limits.map((l) => l.kind)).toEqual(["bitmap-fill"]);
    }
  });

  it("sorts images by bitmapId and keeps one entry per id", () => {
    const body =
      pattern(7, "data:image/PNG;base64,BwcH") +
      pattern(5, "data:image/PNG;base64,AQID") +
      '<path d="M0 0 L9 0 9 9 Z" style="fill:url(#PatternID_9_7)"/>' +
      '<path d="M0 0 L9 0 9 9 Z" style="fill:url(#PatternID_9_7)"/>';
    const { images } = svgToShapeJson(doc(body), "shape", ALL);
    expect(images.map((i) => i.bitmapId)).toEqual([5, 7]);
    expect(images[1]!.bytes).toEqual(new Uint8Array([7, 7, 7]));
  });
});

describe("svgToShapeJson limit order", () => {
  const head =
    '<svg xmlns:ffdec="https://www.free-decompiler.com/flash" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg">';
  const wrap = (body: string): string => `${head}<g transform="matrix(1,0,0,1,0,0)">${body}</g></svg>`;

  it("sorts by kind then message and drops repeats", () => {
    const dash = '<path d="M0 0 L9 0" fill="none" stroke="#000000" stroke-dasharray="4 2"/>';
    const clip = '<path d="M0 0 L9 0" fill="none" stroke="#000000" stroke-linejoin="miter-clip"/>';
    const { limits } = svgToShapeJson(wrap(`${dash}${clip}${dash}${clip}`), "shape");
    expect(limits.map((l) => l.message)).toEqual([
      "approximated: dash array is not drawn, the stroke is solid",
      "approximated: miter-clip join is drawn as miter",
    ]);
    expect(limits.every((l) => l.kind === "stroke-style")).toBe(true);
  });

  it("gives the same list when the attributes of an element are reordered", () => {
    const a = '<path d="M0 0 L9 0" fill="none" stroke="#000000" stroke-dasharray="4 2" stroke-linejoin="miter-clip"/>';
    const b = '<path stroke-linejoin="miter-clip" stroke-dasharray="4 2" stroke="#000000" fill="none" d="M0 0 L9 0"/>';
    expect(svgToShapeJson(wrap(b), "shape").limits).toEqual(svgToShapeJson(wrap(a), "shape").limits);
    expect(svgToShapeJson(wrap(a), "shape").limits).toHaveLength(2);
  });
});
