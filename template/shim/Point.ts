/**
 * flash.geom.Point. Formulas follow Ruffle core/src/avm2/globals/flash/geom/Point.as at commit 4a8d396
 * (read in the robustness design). See .kiro/steering/flash-behaviour.md.
 */
export class Point {
  x: number;
  y: number;
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  add(v: Point): Point {
    return new Point(this.x + v.x, this.y + v.y);
  }
  subtract(v: Point): Point {
    return new Point(this.x - v.x, this.y - v.y);
  }
  clone(): Point {
    return new Point(this.x, this.y);
  }
  equals(p: Point): boolean {
    return this.x === p.x && this.y === p.y;
  }
  /** Scales to the given length. A point of length 0 is left unchanged. */
  normalize(thickness: number): void {
    const len = this.length;
    if (len > 0) {
      const f = thickness / len;
      this.x *= f;
      this.y *= f;
    }
  }
  offset(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }
  copyFrom(p: Point): void {
    this.x = p.x;
    this.y = p.y;
  }
  setTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }
  toString(): string {
    return '(x=' + this.x + ', y=' + this.y + ')';
  }
  static distance(a: Point, b: Point): number {
    return b.subtract(a).length;
  }
  static interpolate(a: Point, b: Point, f: number): Point {
    return new Point(b.x - (b.x - a.x) * f, b.y - (b.y - a.y) * f);
  }
  static polar(len: number, angle: number): Point {
    return new Point(len * Math.cos(angle), len * Math.sin(angle));
  }
}
