import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bakeCmds, cmdsToD, parsePathD } from "../../src/convert/pathData";
import type { Mat6, PathCmd } from "../../template/runtime/shapeJson";
import { fcConfig } from "./config";

// Feature: breadth, Property 6: Path baking composes, path data round-trips

const coord = fc.double({ min: -1000, max: 1000, noNaN: true });
const wide = fc.double({ noNaN: true, noDefaultInfinity: true });
const pt = (n: fc.Arbitrary<number>) => fc.tuple(n, n);

function genCmdsOf(n: fc.Arbitrary<number>): fc.Arbitrary<PathCmd[]> {
  const cmd: fc.Arbitrary<PathCmd> = fc.oneof(
    pt(n).map(([a, b]): PathCmd => ["M", a, b]),
    pt(n).map(([a, b]): PathCmd => ["L", a, b]),
    fc.tuple(n, n, n, n).map(([a, b, c, d]): PathCmd => ["Q", a, b, c, d]),
    fc.tuple(n, n, n, n, n, n).map(([a, b, c, d, e, f]): PathCmd => ["C", a, b, c, d, e, f]),
    fc.constant<PathCmd>(["Z"]),
  );
  return fc
    .tuple(pt(n), fc.array(cmd, { maxLength: 8 }))
    .map(([[x, y], rest]) => [["M", x, y] as PathCmd, ...rest]);
}

const genMat: fc.Arbitrary<Mat6> = fc
  .tuple(...Array.from({ length: 6 }, () => fc.double({ min: -4, max: 4, noNaN: true })))
  .map((t) => t as Mat6);

/** SVG matrix product: apply `a` first, then `b`. */
function mul(b: Mat6, a: Mat6): Mat6 {
  return [
    b[0] * a[0] + b[2] * a[1],
    b[1] * a[0] + b[3] * a[1],
    b[0] * a[2] + b[2] * a[3],
    b[1] * a[2] + b[3] * a[3],
    b[0] * a[4] + b[2] * a[5] + b[4],
    b[1] * a[4] + b[3] * a[5] + b[5],
  ];
}

function expectClose(x: PathCmd[], y: PathCmd[]): void {
  expect(x.length).toBe(y.length);
  x.forEach((c, i) => {
    expect(c[0]).toBe(y[i][0]);
    for (let k = 1; k < c.length; k++) {
      const u = c[k] as number;
      const v = y[i][k] as number;
      expect(Math.abs(u - v)).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(u)));
    }
  });
}

const normZero = (cmds: PathCmd[]): PathCmd[] =>
  cmds.map((c) => c.map((v) => (typeof v === "number" && Object.is(v, -0) ? 0 : v)) as PathCmd);

describe("pathData", () => {
  /** **Validates: Requirements 10.2, 7.7** */
  it("bakeCmds composes: baking m1 then m2 equals baking mul(m2, m1)", () => {
    fc.assert(
      fc.property(genCmdsOf(coord), genMat, genMat, (c, m1, m2) => {
        expectClose(bakeCmds(bakeCmds(c, m1), m2), bakeCmds(c, mul(m2, m1)));
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 10.2, 7.7** */
  it("parsePathD(cmdsToD(c)) equals c, over the full double range", () => {
    fc.assert(
      fc.property(genCmdsOf(wide), (c) => {
        expect(parsePathD(cmdsToD(c))).toEqual(normZero(c));
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 10.2** */
  it("implicit repetition: pairs after M are L, repeated L, Q and C groups expand", () => {
    expect(parsePathD("M0 0 10 0 10 10 L1 2 3 4 Q1 1 2 2 3 3 4 4 C1 2 3 4 5 6 Z")).toEqual([
      ["M", 0, 0],
      ["L", 10, 0],
      ["L", 10, 10],
      ["L", 1, 2],
      ["L", 3, 4],
      ["Q", 1, 1, 2, 2],
      ["Q", 3, 3, 4, 4],
      ["C", 1, 2, 3, 4, 5, 6],
      ["Z"],
    ]);
  });

  /** **Validates: Requirements 10.2** */
  it("reads compact numbers, exponents, relative and H/V commands; rejects arcs and stray numbers", () => {
    expect(parsePathD("M1-2.5.5e1 4L-.5,3")).toEqual([["M", 1, -2.5], ["L", 5, 4], ["L", -0.5, 3]]);
    expect(parsePathD("m1 1 l2 0 h1 v1 z")).toEqual([["M", 1, 1], ["L", 3, 1], ["L", 4, 1], ["L", 4, 2], ["Z"]]);
    expect(() => parsePathD("M0 0 A1 1 0 0 0 1 1")).toThrow();
    expect(() => parsePathD("L1 1")).toThrow();
    expect(() => parsePathD("M0 0 Z 1 1")).toThrow();
  });
});
