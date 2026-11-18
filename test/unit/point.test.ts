import { describe, expect, it } from "vitest";
import { Point } from "../../template/shim/Point";

describe("Point", () => {
  it("constructs with defaults and values", () => {
    expect([new Point().x, new Point().y]).toEqual([0, 0]);
    const p = new Point(3, 4);
    expect([p.x, p.y]).toEqual([3, 4]);
  });
  it("length", () => {
    expect(new Point(3, 4).length).toBe(5);
  });
  it("add, subtract, clone return new points", () => {
    const a = new Point(1, 2);
    const b = new Point(10, 20);
    const s = a.add(b);
    expect([s.x, s.y]).toEqual([11, 22]);
    const d = b.subtract(a);
    expect([d.x, d.y]).toEqual([9, 18]);
    const c = a.clone();
    expect(c).not.toBe(a);
    expect(c.equals(a)).toBe(true);
    expect([a.x, a.y]).toEqual([1, 2]);
  });
  it("equals compares both fields", () => {
    expect(new Point(1, 2).equals(new Point(1, 2))).toBe(true);
    expect(new Point(1, 2).equals(new Point(1, 3))).toBe(false);
  });
  it("normalize scales to the thickness", () => {
    const p = new Point(3, 4);
    p.normalize(10);
    expect([p.x, p.y]).toEqual([6, 8]);
  });
  it("normalize leaves the origin unchanged", () => {
    const p = new Point(0, 0);
    p.normalize(5);
    expect([p.x, p.y]).toEqual([0, 0]);
  });
  it("offset, copyFrom, setTo assign in place", () => {
    const p = new Point(1, 1);
    p.offset(2, 3);
    expect([p.x, p.y]).toEqual([3, 4]);
    p.copyFrom(new Point(7, 8));
    expect([p.x, p.y]).toEqual([7, 8]);
    p.setTo(-1, -2);
    expect([p.x, p.y]).toEqual([-1, -2]);
  });
  it("distance", () => {
    expect(Point.distance(new Point(0, 0), new Point(3, 4))).toBe(5);
    expect(Point.distance(new Point(3, 4), new Point(0, 0))).toBe(5);
  });
  it("interpolate: f = 1 gives a, f = 0 gives b", () => {
    const a = new Point(0, 0);
    const b = new Point(10, 20);
    const one = Point.interpolate(a, b, 1);
    const zero = Point.interpolate(a, b, 0);
    const half = Point.interpolate(a, b, 0.5);
    expect([one.x, one.y]).toEqual([0, 0]);
    expect([zero.x, zero.y]).toEqual([10, 20]);
    expect([half.x, half.y]).toEqual([5, 10]);
  });
  it("polar", () => {
    const p = Point.polar(2, 0);
    expect([p.x, p.y]).toEqual([2, 0]);
    const q = Point.polar(3, Math.PI / 2);
    expect(q.x).toBeCloseTo(0, 12);
    expect(q.y).toBeCloseTo(3, 12);
  });
  it("toString", () => {
    expect(new Point(1, 2).toString()).toBe("(x=1, y=2)");
    expect(String(new Point())).toBe("(x=0, y=0)");
  });
});
