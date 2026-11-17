import { describe, expect, it } from "vitest";
import { Rectangle } from "../../template/shim/Rectangle";

describe("Rectangle", () => {
  it("derives the edges", () => {
    const r = new Rectangle(10, 20, 30, 40);
    expect([r.left, r.top, r.right, r.bottom]).toEqual([10, 20, 40, 60]);
  });

  it("defaults to the zero rectangle", () => {
    const r = new Rectangle();
    expect([r.x, r.y, r.width, r.height]).toEqual([0, 0, 0, 0]);
  });

  it("keeps width when x is set and height when y is set", () => {
    const r = new Rectangle(10, 20, 30, 40);
    r.x = 50;
    r.y = 5;
    expect([r.width, r.height, r.right, r.bottom]).toEqual([30, 40, 80, 45]);
  });

  it("keeps right when left is set and bottom when top is set", () => {
    const r = new Rectangle(10, 20, 30, 40);
    r.left = 0;
    r.top = 30;
    expect([r.x, r.width, r.right]).toEqual([0, 40, 40]);
    expect([r.y, r.height, r.bottom]).toEqual([30, 30, 60]);
  });

  it("intersects overlapping rectangles", () => {
    const i = new Rectangle(0, 0, 10, 10).intersection(new Rectangle(5, 6, 10, 10));
    expect([i.x, i.y, i.width, i.height]).toEqual([5, 6, 5, 4]);
    expect(new Rectangle(0, 0, 10, 10).intersects(new Rectangle(5, 6, 10, 10))).toBe(true);
  });

  it("gives the rectangle at (0, 0) with no size when disjoint or only touching", () => {
    for (const other of [new Rectangle(20, 20, 5, 5), new Rectangle(10, 0, 5, 5)]) {
      const i = new Rectangle(0, 0, 10, 10).intersection(other);
      expect([i.x, i.y, i.width, i.height]).toEqual([0, 0, 0, 0]);
      expect(new Rectangle(0, 0, 10, 10).intersects(other)).toBe(false);
    }
  });

  it("offsets in place", () => {
    const r = new Rectangle(1, 2, 3, 4);
    r.offset(10, -2);
    expect([r.x, r.y, r.width, r.height]).toEqual([11, 0, 3, 4]);
  });
});
