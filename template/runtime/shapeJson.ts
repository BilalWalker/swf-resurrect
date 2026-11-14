// Shape_JSON: the vector form of one FFDec shape, its validator, parser and canonical printer, and the DRAWN_FILLS
// capability constant (breadth design section 2, "Fills before they are drawn"). Core: no node module, clock or
// randomness, so the same file runs in the browser, in the Replay and in Convert.

export type Mat6 = [number, number, number, number, number, number];

export type PathCmd =
  | ['M', number, number]
  | ['L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

/** `color` is '#rrggbb'. */
export interface GradientStop {
  offset: number;
  color: string;
  alpha: number;
}

export type ShapeFill =
  | { kind: 'solid'; color: string; alpha: number }
  | {
      kind: 'gradient';
      type: 'linear' | 'radial';
      matrix: Mat6;
      stops: GradientStop[];
      spread: 'pad' | 'reflect' | 'repeat';
      focal?: { x: number; y: number };
    }
  /** `image` is 'images/5.png'. */
  | { kind: 'bitmap'; image: string; matrix: Mat6; smooth: boolean };

export interface ShapeStroke {
  color: string;
  alpha: number;
  width: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  miterLimit: number;
}

export interface Contour {
  outer: PathCmd[];
  holes: PathCmd[][];
}

export interface ShapePath {
  contours: Contour[];
  fill: ShapeFill | null;
  stroke: ShapeStroke | null;
}

export interface ShapeJson {
  formatVersion: 1;
  paths: ShapePath[];
}

/** The message starts with the path of the failing field, as in `paths[2].fill.stops[1].offset: must be in 0..1`. */
export class ShapeJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShapeJsonError';
  }
}

/** Which fill kinds the committed drawing code in pixiBackend.ts draws. */
export interface DrawnFills {
  gradientLinear: boolean;
  gradientRadial: boolean;
  bitmap: boolean;
}

/**
 * What the committed drawing code in pixiBackend.ts draws. Starts all false; the drawing tasks flip their flag in the
 * commit that adds the drawing code and its tests (design section 2, decision D21).
 */
export const DRAWN_FILLS: DrawnFills = { gradientLinear: true, gradientRadial: false, bitmap: false };

/** Solid: always. Gradient: by type. Bitmap: `caps.bitmap`. */
export function fillIsDrawn(fill: ShapeFill, caps: DrawnFills): boolean {
  switch (fill.kind) {
    case 'solid':
      return true;
    case 'gradient':
      return fill.type === 'linear' ? caps.gradientLinear : caps.gradientRadial;
    case 'bitmap':
      return caps.bitmap;
  }
}

/** The name of a fill kind in error messages: `solid`, `gradient-linear`, `gradient-radial`, `bitmap`. */
export function fillKindName(fill: ShapeFill): string {
  return fill.kind === 'gradient' ? `gradient-${fill.type}` : fill.kind;
}

/**
 * The check every backend runs before it draws a fill: throws `ShapeJsonError('<path>: fill kind not drawn: <kind>')` when
 * `fillIsDrawn(fill, caps)` is false. There is no warn-and-skip state (decision D21). `path` is the field path of the
 * fill, e.g. `paths[2].fill`.
 */
export function assertFillDrawn(fill: ShapeFill, path: string, caps: DrawnFills = DRAWN_FILLS): void {
  if (!fillIsDrawn(fill, caps)) throw new ShapeJsonError(`${path}: fill kind not drawn: ${fillKindName(fill)}`);
}

/** Runs `assertFillDrawn` on every fill of a shape, in path order. */
export function assertShapeDrawn(shape: ShapeJson, caps: DrawnFills = DRAWN_FILLS): void {
  shape.paths.forEach((p, i) => {
    if (p.fill !== null) assertFillDrawn(p.fill, `paths[${i}].fill`, caps);
  });
}

// ---- validation ---------------------------------------------------------------------------------------------

const COLOR = /^#[0-9a-f]{6}$/;
const IMAGE = /^images\/[0-9]+\.(png|jpg)$/;
const ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

function fail(path: string, problem: string): never {
  throw new ShapeJsonError(`${path}: ${problem}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fail(path, 'must be a finite number');
  if (Object.is(v, -0)) return fail(path, 'must not be -0');
  return v;
}

function checkColor(v: unknown, path: string): void {
  if (typeof v !== 'string' || !COLOR.test(v)) fail(path, 'must match #rrggbb');
}

function checkAlpha(v: unknown, path: string): void {
  const n = checkNumber(v, path);
  if (n < 0 || n > 1) fail(path, 'must be in 0..1');
}

function checkOneOf(v: unknown, path: string, allowed: readonly string[]): void {
  if (typeof v !== 'string' || !allowed.includes(v)) fail(path, `must be one of ${allowed.join(', ')}`);
}

function checkMatrix(v: unknown, path: string): void {
  if (!Array.isArray(v) || v.length !== 6) return fail(path, 'must be an array of 6 numbers');
  v.forEach((n, i) => checkNumber(n, `${path}[${i}]`));
}

function checkCommands(v: unknown, path: string): void {
  if (!Array.isArray(v)) return fail(path, 'must be an array of commands');
  v.forEach((cmd, i) => {
    const at = `${path}[${i}]`;
    if (!Array.isArray(cmd)) return fail(at, 'must be a command array');
    const op: unknown = cmd[0];
    if (typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(ARITY, op)) {
      return fail(`${at}[0]`, 'must be one of M, L, Q, C, Z');
    }
    if (i === 0 && op !== 'M') return fail(`${at}[0]`, 'the first command must be M');
    if (cmd.length !== 1 + ARITY[op]!) return fail(at, `${op} takes ${ARITY[op]} numbers`);
    for (let k = 1; k < cmd.length; k++) checkNumber(cmd[k], `${at}[${k}]`);
  });
  if (v.length === 0) fail(path, 'the first command must be M');
}

function checkStops(v: unknown, path: string): void {
  if (!Array.isArray(v) || v.length < 2) return fail(path, 'must have at least 2 stops');
  let prev = 0;
  v.forEach((s, i) => {
    const at = `${path}[${i}]`;
    if (!isRecord(s)) return fail(at, 'must be an object');
    const offset = checkNumber(s.offset, `${at}.offset`);
    if (offset < 0 || offset > 1) fail(`${at}.offset`, 'must be in 0..1');
    if (offset < prev) fail(`${at}.offset`, 'stops must be sorted by offset');
    prev = offset;
    checkColor(s.color, `${at}.color`);
    checkAlpha(s.alpha, `${at}.alpha`);
  });
}

function checkFill(v: unknown, path: string): void {
  if (!isRecord(v)) return fail(path, 'must be an object or null');
  switch (v.kind) {
    case 'solid':
      checkColor(v.color, `${path}.color`);
      checkAlpha(v.alpha, `${path}.alpha`);
      return;
    case 'gradient':
      checkOneOf(v.type, `${path}.type`, ['linear', 'radial']);
      checkMatrix(v.matrix, `${path}.matrix`);
      checkStops(v.stops, `${path}.stops`);
      checkOneOf(v.spread, `${path}.spread`, ['pad', 'reflect', 'repeat']);
      if (v.focal !== undefined) {
        if (!isRecord(v.focal)) return fail(`${path}.focal`, 'must be an object');
        checkNumber(v.focal.x, `${path}.focal.x`);
        checkNumber(v.focal.y, `${path}.focal.y`);
      }
      return;
    case 'bitmap':
      if (typeof v.image !== 'string' || !IMAGE.test(v.image)) fail(`${path}.image`, 'must match images/<id>.png or .jpg');
      checkMatrix(v.matrix, `${path}.matrix`);
      if (typeof v.smooth !== 'boolean') fail(`${path}.smooth`, 'must be a boolean');
      return;
    default:
      return fail(`${path}.kind`, 'must be one of solid, gradient, bitmap');
  }
}

function checkStroke(v: unknown, path: string): void {
  if (!isRecord(v)) return fail(path, 'must be an object or null');
  checkColor(v.color, `${path}.color`);
  checkAlpha(v.alpha, `${path}.alpha`);
  if (checkNumber(v.width, `${path}.width`) < 0) fail(`${path}.width`, 'must be >= 0');
  checkOneOf(v.cap, `${path}.cap`, ['butt', 'round', 'square']);
  checkOneOf(v.join, `${path}.join`, ['miter', 'round', 'bevel']);
  if (checkNumber(v.miterLimit, `${path}.miterLimit`) < 1) fail(`${path}.miterLimit`, 'must be >= 1');
}

function checkContour(v: unknown, path: string): void {
  if (!isRecord(v)) return fail(path, 'must be an object');
  checkCommands(v.outer, `${path}.outer`);
  if (!Array.isArray(v.holes)) return fail(`${path}.holes`, 'must be an array');
  v.holes.forEach((h, i) => checkCommands(h, `${path}.holes[${i}]`));
}

export function validateShapeJson(x: unknown): asserts x is ShapeJson {
  if (!isRecord(x)) return fail('(root)', 'must be an object');
  if (x.formatVersion !== 1) fail('formatVersion', 'must be 1');
  if (!Array.isArray(x.paths)) return fail('paths', 'must be an array');
  x.paths.forEach((p: unknown, i) => {
    const at = `paths[${i}]`;
    if (!isRecord(p)) return fail(at, 'must be an object');
    if (!Array.isArray(p.contours)) return fail(`${at}.contours`, 'must be an array');
    p.contours.forEach((c, k) => checkContour(c, `${at}.contours[${k}]`));
    if (p.fill !== null) checkFill(p.fill, `${at}.fill`);
    if (p.stroke !== null) checkStroke(p.stroke, `${at}.stroke`);
    if (p.fill === null && p.stroke === null) fail(at, 'needs a fill or a stroke');
  });
}

/** JSON.parse and validate. A syntax error is reported as a ShapeJsonError too. */
export function parseShapeJson(text: string): ShapeJson {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return fail('(root)', `not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  validateShapeJson(value);
  return value;
}

// ---- printing -----------------------------------------------------------------------------------------------

/** `-0` becomes `0`; JSON.stringify prints the shortest form that reads back to the same number. */
const num = (n: number): number => n + 0;

function printCmds(cmds: PathCmd[]): unknown[] {
  return cmds.map((c) => c.map((v, i) => (i === 0 ? v : num(v as number))));
}

function printMatrix(m: Mat6): number[] {
  return m.map(num);
}

function printFill(f: ShapeFill): unknown {
  switch (f.kind) {
    case 'solid':
      return { kind: 'solid', color: f.color, alpha: num(f.alpha) };
    case 'gradient':
      return {
        kind: 'gradient',
        type: f.type,
        matrix: printMatrix(f.matrix),
        stops: f.stops.map((s) => ({ offset: num(s.offset), color: s.color, alpha: num(s.alpha) })),
        spread: f.spread,
        ...(f.focal === undefined ? {} : { focal: { x: num(f.focal.x), y: num(f.focal.y) } }),
      };
    case 'bitmap':
      return { kind: 'bitmap', image: f.image, matrix: printMatrix(f.matrix), smooth: f.smooth };
  }
}

/** Canonical text: fixed key order, no `-0`, no whitespace. Assumes a valid value. */
export function printShapeJson(s: ShapeJson): string {
  const canonical = {
    formatVersion: 1,
    paths: s.paths.map((p) => ({
      contours: p.contours.map((c) => ({ outer: printCmds(c.outer), holes: c.holes.map(printCmds) })),
      fill: p.fill === null ? null : printFill(p.fill),
      stroke:
        p.stroke === null
          ? null
          : {
              color: p.stroke.color,
              alpha: num(p.stroke.alpha),
              width: num(p.stroke.width),
              cap: p.stroke.cap,
              join: p.stroke.join,
              miterLimit: num(p.stroke.miterLimit),
            },
    })),
  };
  return JSON.stringify(canonical);
}
