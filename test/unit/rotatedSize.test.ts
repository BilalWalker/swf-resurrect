import { describe, expect, it } from "vitest";
import { ShapeObject } from "../../template/runtime/stageTree";
import { Sprite } from "../../template/shim/Sprite";

const r = (n: number): number => Math.round(n * 1e6) / 1e6;

function shape(w: number, h: number): ShapeObject {
  return new ShapeObject(1, { x: 0, y: 0, width: w, height: h });
}

describe("rotated width and height", () => {
  it("keeps the old values at rotation 0, for shapes and clips", () => {
    const s = shape(10, 20);
    s.scaleX = -2;
    s.scaleY = 3;
    expect([s.width, s.height]).toEqual([20, 60]);
    const c = new Sprite();
    c.addChild(shape(10, 20));
    c.scaleX = 2;
    expect([c.width, c.height]).toEqual([20, 20]);
  });

  it("swaps width and height at 90 degrees for a shape and a clip", () => {
    const s = shape(10, 20);
    s.rotation = 90;
    expect([r(s.width), r(s.height)]).toEqual([20, 10]);
    const c = new Sprite();
    c.addChild(shape(10, 20));
    c.rotation = 90;
    expect([r(c.width), r(c.height)]).toEqual([20, 10]);
  });

  it("is 0 x 0 for an empty object", () => {
    const c = new Sprite();
    c.rotation = 30;
    expect([c.width, c.height]).toEqual([0, 0]);
    c.width = 50;
    expect(c.scaleX).toBe(1);
  });

  it("setter changes the scale so the getter returns the request", () => {
    const s = shape(10, 20);
    s.rotation = 30;
    s.width = 40;
    expect(r(s.width)).toBe(40);
    s.height = 55;
    expect(r(s.height)).toBe(55);
    const c = new Sprite();
    c.addChild(shape(10, 20));
    c.width = 30;
    expect(c.scaleX).toBe(3);
  });

  it("leaves the scale when the axis term is 0 at 90 degrees", () => {
    const s = shape(10, 20);
    s.rotation = 90;
    s.scaleX = 1;
    s.width = 100;
    expect(s.scaleX).toBe(1);
  });
});
