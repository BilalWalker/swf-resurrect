import { describe, expect, it } from "vitest";
import { ShapeObject } from "../../template/runtime/stageTree";
import { Rectangle } from "../../template/shim/Rectangle";
import { Sprite } from "../../template/shim/Sprite";

// Rounded so that the cos/sin of a rotation does not leave 1e-15 residue; -0 becomes 0.
const tuple = (r: Rectangle): number[] => [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 1e6) / 1e6 + 0);

function shape(x: number, y: number, w: number, h: number): ShapeObject {
  return new ShapeObject(1, { x, y, width: w, height: h });
}

describe("DisplayObject.getBounds", () => {
  it("returns the zero rectangle for an empty clip", () => {
    expect(tuple(new Sprite().getBounds())).toEqual([0, 0, 0, 0]);
    const outer = new Sprite();
    outer.addChild(new Sprite());
    expect(tuple(outer.getBounds(outer))).toEqual([0, 0, 0, 0]);
  });

  it("returns the shape bounds in its own space, without its own transform", () => {
    const s = shape(-5, -10, 20, 30);
    s.x = 100;
    s.scaleX = 2;
    expect(tuple(s.getBounds(s))).toEqual([-5, -10, 20, 30]);
    expect(tuple(s.getBounds())).toEqual([-5, -10, 20, 30]);
  });

  it("applies the object's own transform in the space of its parent", () => {
    const parent = new Sprite();
    const s = shape(0, 0, 10, 20);
    s.x = 100;
    s.y = 50;
    s.scaleX = 2;
    parent.addChild(s);
    expect(tuple(s.getBounds(parent))).toEqual([100, 50, 20, 20]);
    expect(tuple(parent.getBounds(parent))).toEqual([100, 50, 20, 20]);
  });

  it("gives the box of the rotated box for a rotated clip", () => {
    const parent = new Sprite();
    const clip = new Sprite();
    clip.addChild(shape(0, 0, 10, 20));
    clip.rotation = 90;
    parent.addChild(clip);
    // Rotation by 90 degrees maps (x, y) to (-y, x): the box becomes x -20..0, y 0..10.
    expect(tuple(clip.getBounds(parent))).toEqual([-20, 0, 20, 10]);
  });

  it("is the box of the transformed box when the target space is another object", () => {
    const root = new Sprite();
    const a = new Sprite();
    const b = new Sprite();
    root.addChild(a);
    root.addChild(b);
    a.x = 10;
    a.addChild(shape(0, 0, 10, 10));
    b.x = 30;
    b.y = 5;
    b.scaleX = 2;
    // a's content spans 10..20 in root space; in b's space that is (10 - 30) / 2 .. (20 - 30) / 2 and y shifted by -5.
    expect(tuple(a.getBounds(b))).toEqual([-10, -5, 5, 10]);
  });

  it("sums nested children level by level", () => {
    const root = new Sprite();
    const inner = new Sprite();
    inner.x = 10;
    inner.addChild(shape(0, 0, 4, 4));
    root.addChild(inner);
    root.addChild(shape(-3, 0, 2, 2));
    expect(tuple(root.getBounds())).toEqual([-3, 0, 17, 4]);
  });

  it("ignores the visible flag", () => {
    const s = shape(0, 0, 10, 10);
    s.visible = false;
    expect(tuple(s.getBounds())).toEqual([0, 0, 10, 10]);
  });
});

describe("container width and height (as3-coverage task 31)", () => {
  it("a Sprite measures its content in its parent's space: own scale and rotation included, 0 when empty", () => {
    const clip = new Sprite();
    expect([clip.width, clip.height]).toEqual([0, 0]);
    const s = shape(-5, -10, 50, 30);
    s.x = 10;
    clip.addChild(s);
    expect([clip.width, clip.height]).toEqual([50, 30]);
    clip.scaleX = 2;
    expect([clip.width, clip.height]).toEqual([100, 30]);
    clip.scaleX = 1;
    clip.rotation = 90;
    expect([Math.round(clip.width * 1e6) / 1e6, Math.round(clip.height * 1e6) / 1e6]).toEqual([30, 50]);
  });
  it("a shape keeps its intrinsic width times its scale", () => {
    const s = shape(0, 0, 10, 20);
    s.scaleX = 3;
    expect([s.width, s.height]).toEqual([30, 20]);
  });
});
