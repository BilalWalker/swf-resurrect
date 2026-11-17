import { registerClassName } from './internal';

/**
 * flash.geom.Rectangle with the members of as3-coverage Requirement 23.5. Setting `x` or `y` keeps `width` and
 * `height`; setting `left` or `top` moves that edge and changes the size so that `right` and `bottom` stay.
 * Edge rules (touching rectangles do not intersect, an empty operand gives the zero rectangle) follow
 * Requirement 23.6; the Flash behaviour for rectangles that only touch was neither read nor measured.
 */
export class Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get left(): number {
    return this.x;
  }
  set left(v: number) {
    this.width += this.x - v;
    this.x = v;
  }
  get top(): number {
    return this.y;
  }
  set top(v: number) {
    this.height += this.y - v;
    this.y = v;
  }
  get right(): number {
    return this.x + this.width;
  }
  set right(v: number) {
    this.width = v - this.x;
  }
  get bottom(): number {
    return this.y + this.height;
  }
  set bottom(v: number) {
    this.height = v - this.y;
  }

  /** The overlap of the two rectangles, or the rectangle (0, 0, 0, 0) when they do not overlap. */
  intersection(rect: Rectangle): Rectangle {
    const l = Math.max(this.left, rect.left);
    const t = Math.max(this.top, rect.top);
    const r = Math.min(this.right, rect.right);
    const b = Math.min(this.bottom, rect.bottom);
    if (!(r > l) || !(b > t)) return new Rectangle(0, 0, 0, 0);
    return new Rectangle(l, t, r - l, b - t);
  }

  intersects(rect: Rectangle): boolean {
    const i = this.intersection(rect);
    return i.width > 0 && i.height > 0;
  }

  offset(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

}

registerClassName(Rectangle, 'Rectangle');
