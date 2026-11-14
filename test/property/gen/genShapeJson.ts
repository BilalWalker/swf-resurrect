import fc from "fast-check";
import type {
  Contour,
  GradientStop,
  Mat6,
  PathCmd,
  ShapeFill,
  ShapeJson,
  ShapePath,
  ShapeStroke,
} from "../../../template/runtime/shapeJson";

/** A finite number that is never -0. */
const genNum = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e5, max: 1e5 }).map((n) => n + 0);
const genUnit = fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1 }).map((n) => n + 0);
const genColor = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, "0")}`);

const genMat6: fc.Arbitrary<Mat6> = fc.tuple(genNum, genNum, genNum, genNum, genNum, genNum);

const genCmd: fc.Arbitrary<PathCmd> = fc.oneof(
  fc.tuple(genNum, genNum).map(([a, b]): PathCmd => ["L", a, b]),
  fc.tuple(genNum, genNum, genNum, genNum).map(([a, b, c, d]): PathCmd => ["Q", a, b, c, d]),
  fc.tuple(genNum, genNum, genNum, genNum, genNum, genNum).map(([a, b, c, d, e, f]): PathCmd => ["C", a, b, c, d, e, f]),
  fc.constant<PathCmd>(["Z"]),
);

/** Commands that start with M. */
const genCmds: fc.Arbitrary<PathCmd[]> = fc
  .tuple(fc.tuple(genNum, genNum), fc.array(genCmd, { maxLength: 5 }))
  .map(([[x, y], rest]) => [["M", x, y] as PathCmd, ...rest]);

const genContour: fc.Arbitrary<Contour> = fc.record({
  outer: genCmds,
  holes: fc.array(genCmds, { maxLength: 2 }),
});

const genStops: fc.Arbitrary<GradientStop[]> = fc
  .array(fc.record({ offset: genUnit, color: genColor, alpha: genUnit }), { minLength: 2, maxLength: 4 })
  .map((s) => [...s].sort((a, b) => a.offset - b.offset));

const genFill: fc.Arbitrary<ShapeFill> = fc.oneof(
  fc.record({ kind: fc.constant("solid" as const), color: genColor, alpha: genUnit }),
  fc
    .record({
      kind: fc.constant("gradient" as const),
      type: fc.constantFrom("linear" as const, "radial" as const),
      matrix: genMat6,
      stops: genStops,
      spread: fc.constantFrom("pad" as const, "reflect" as const, "repeat" as const),
      focal: fc.option(fc.record({ x: genNum, y: genNum }), { nil: undefined }),
    })
    // An absent focal is an absent key, never `focal: undefined`.
    .map(({ focal, ...rest }): ShapeFill => (focal === undefined ? rest : { ...rest, focal })),
  fc.record({
    kind: fc.constant("bitmap" as const),
    image: fc
      .tuple(fc.nat(500), fc.constantFrom("png", "jpg"))
      .map(([id, ext]) => `images/${id}.${ext}`),
    matrix: genMat6,
    smooth: fc.boolean(),
  }),
);

const genStroke: fc.Arbitrary<ShapeStroke> = fc.record({
  color: genColor,
  alpha: genUnit,
  width: genNum.map((n) => Math.abs(n) + 0),
  cap: fc.constantFrom("butt" as const, "round" as const, "square" as const),
  join: fc.constantFrom("miter" as const, "round" as const, "bevel" as const),
  miterLimit: genNum.map((n) => Math.abs(n) + 1),
});

const genPath: fc.Arbitrary<ShapePath> = fc
  .record({
    contours: fc.array(genContour, { maxLength: 2 }),
    fill: fc.option(genFill, { nil: null }),
    stroke: fc.option(genStroke, { nil: null }),
  })
  .filter((p) => p.fill !== null || p.stroke !== null);

/** A valid Shape_JSON (no `-0`, finite numbers, sorted stops, a fill or a stroke per path). */
export const genShapeJson: fc.Arbitrary<ShapeJson> = fc.record({
  formatVersion: fc.constant(1 as const),
  paths: fc.array(genPath, { maxLength: 4 }),
});

export interface Corruption {
  /** The path the validator must name at the start of its message. */
  path: string;
  /** Applies the single corruption to a deep copy of a valid shape. */
  apply: (s: any) => void;
}

/** Every single-field corruption that applies to this shape. Never empty (`formatVersion` always applies). */
export function corruptionsOf(shape: ShapeJson): Corruption[] {
  const out: Corruption[] = [{ path: "formatVersion", apply: (s) => (s.formatVersion = 2) }];
  shape.paths.forEach((p, i) => {
    const at = `paths[${i}]`;
    out.push({
      path: at,
      apply: (s) => {
        s.paths[i].fill = null;
        s.paths[i].stroke = null;
      },
    });
    if (p.contours.length > 0) {
      out.push({ path: `${at}.contours[0].outer[0][1]`, apply: (s) => (s.paths[i].contours[0].outer[0][1] = Number.NaN) });
      out.push({ path: `${at}.contours[0].outer[0][0]`, apply: (s) => (s.paths[i].contours[0].outer[0][0] = "L") });
    }
    const f = p.fill;
    if (f?.kind === "solid") {
      out.push({ path: `${at}.fill.color`, apply: (s) => (s.paths[i].fill.color = "red") });
      out.push({ path: `${at}.fill.alpha`, apply: (s) => (s.paths[i].fill.alpha = 1.5) });
    } else if (f?.kind === "gradient") {
      out.push({ path: `${at}.fill.matrix[0]`, apply: (s) => (s.paths[i].fill.matrix[0] = Number.POSITIVE_INFINITY) });
      out.push({ path: `${at}.fill.stops[0].color`, apply: (s) => (s.paths[i].fill.stops[0].color = "#12345") });
      out.push({ path: `${at}.fill.stops[1].alpha`, apply: (s) => (s.paths[i].fill.stops[1].alpha = -0.5) });
      out.push({
        path: `${at}.fill.stops[1].offset`,
        apply: (s) => {
          s.paths[i].fill.stops[0].offset = 1;
          s.paths[i].fill.stops[1].offset = 0;
        },
      });
      out.push({ path: `${at}.fill.stops`, apply: (s) => s.paths[i].fill.stops.splice(1) });
    } else if (f?.kind === "bitmap") {
      out.push({ path: `${at}.fill.image`, apply: (s) => (s.paths[i].fill.image = "images/x.gif") });
    }
    if (p.stroke !== null) {
      out.push({ path: `${at}.stroke.width`, apply: (s) => (s.paths[i].stroke.width = -1) });
      out.push({ path: `${at}.stroke.miterLimit`, apply: (s) => (s.paths[i].stroke.miterLimit = 0.5) });
      out.push({ path: `${at}.stroke.color`, apply: (s) => (s.paths[i].stroke.color = "#FFFFFF") });
    }
  });
  return out;
}
