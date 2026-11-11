// Scene_JSON types and validation. Shared by the pipeline and the emitted runtime.
// No Node imports: this file runs in the browser.

export type Matrix6 = [number, number, number, number, number, number];
export type ColorTransform8 = [number, number, number, number, number, number, number, number];

export interface ShapeSymbol {
  type: 'shape';
  file: string; // "<id>.svg"
  origin: { x: number; y: number };
}

export interface DisplayListEntry {
  depth: number; // unique per frame; ascending
  symbolId: number; // key into symbols
  matrix: Matrix6; // a b c d tx ty; tx, ty in px
  colorTransform: ColorTransform8; // rMul gMul bMul aMul rAdd gAdd bAdd aAdd
  name: string; // "" = no instance name
}

export interface SpriteSymbol {
  type: 'sprite';
  className?: string; // omitted when not linked
  frameCount: number; // equals frames.length
  frames: DisplayListEntry[][]; // frames[i] is frame i + 1
  labels: Array<{ name: string; frame: number }>; // frame is 1-based
}

export interface SceneJson {
  formatVersion: 1;
  stage: { width: number; height: number; backgroundColor: string; frameRate: number };
  rootSymbolId: number;
  symbols: Record<string, ShapeSymbol | SpriteSymbol>;
}

export class SceneParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SceneParseError';
  }
}

const MAX_ROOT_FRAMES = 65535;

function fail(path: string, problem: string): never {
  throw new SceneParseError(`${path}: ${problem}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number');
  if (Object.is(v, -0)) fail(path, 'must not be -0');
  return v;
}

function checkInt(v: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = checkNumber(v, path);
  if (!Number.isInteger(n) || n < min || n > max) {
    fail(path, `must be an integer in ${min}..${max}`);
  }
  return n;
}

function checkNumberTuple(v: unknown, length: number, path: string): void {
  if (!Array.isArray(v) || v.length !== length) fail(path, `must be an array of ${length} numbers`);
  for (let i = 0; i < length; i++) checkNumber(v[i], `${path}[${i}]`);
}

export function validateScene(scene: unknown): asserts scene is SceneJson {
  if (!isRecord(scene)) fail('scene', 'must be an object');
  if (scene.formatVersion !== 1) fail('formatVersion', 'must be 1');

  const stage = scene.stage;
  if (!isRecord(stage)) fail('stage', 'must be an object');
  checkNumber(stage.width, 'stage.width');
  checkNumber(stage.height, 'stage.height');
  checkNumber(stage.frameRate, 'stage.frameRate');
  if ((stage.frameRate as number) <= 0) fail('stage.frameRate', 'must be greater than 0');
  if (typeof stage.backgroundColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(stage.backgroundColor)) {
    fail('stage.backgroundColor', 'must be "#rrggbb"');
  }

  const rootId = checkInt(scene.rootSymbolId, 'rootSymbolId', 0);
  const symbols = scene.symbols;
  if (!isRecord(symbols)) fail('symbols', 'must be an object');

  for (const key of Object.keys(symbols)) {
    const sym = symbols[key];
    const sp = `symbols[${key}]`;
    if (!/^(0|[1-9][0-9]*)$/.test(key)) fail(sp, 'key must be a decimal symbol id');
    if (!isRecord(sym)) fail(sp, 'must be an object');

    if (sym.type === 'shape') {
      if (sym.file !== `${key}.svg`) fail(`${sp}.file`, `must equal "${key}.svg"`);
      const origin = sym.origin;
      if (!isRecord(origin)) fail(`${sp}.origin`, 'must be an object');
      checkNumber(origin.x, `${sp}.origin.x`);
      checkNumber(origin.y, `${sp}.origin.y`);
    } else if (sym.type === 'sprite') {
      if (sym.className !== undefined && typeof sym.className !== 'string') {
        fail(`${sp}.className`, 'must be a string when present');
      }
      const max = Number(key) === rootId ? MAX_ROOT_FRAMES : Number.MAX_SAFE_INTEGER;
      const frameCount = checkInt(sym.frameCount, `${sp}.frameCount`, 1, max);
      const frames = sym.frames;
      if (!Array.isArray(frames)) fail(`${sp}.frames`, 'must be an array');
      if (frames.length !== frameCount) {
        fail(`${sp}.frames`, `length ${frames.length} does not equal frameCount ${frameCount}`);
      }
      frames.forEach((frame: unknown, fi: number) => {
        const fp = `${sp}.frames[${fi}]`;
        if (!Array.isArray(frame)) fail(fp, 'must be an array');
        let prevDepth = -Infinity;
        frame.forEach((entry: unknown, ei: number) => {
          const ep = `${fp}[${ei}]`;
          if (!isRecord(entry)) fail(ep, 'must be an object');
          const depth = checkInt(entry.depth, `${ep}.depth`, -Number.MAX_SAFE_INTEGER);
          if (depth <= prevDepth) fail(`${ep}.depth`, 'must be strictly ascending within a frame');
          prevDepth = depth;
          const symbolId = checkInt(entry.symbolId, `${ep}.symbolId`, 0);
          if (!Object.prototype.hasOwnProperty.call(symbols, String(symbolId))) {
            fail(`${ep}.symbolId`, `refers to missing symbol ${symbolId}`);
          }
          checkNumberTuple(entry.matrix, 6, `${ep}.matrix`);
          checkNumberTuple(entry.colorTransform, 8, `${ep}.colorTransform`);
          if (typeof entry.name !== 'string') fail(`${ep}.name`, 'must be a string');
        });
      });
      const labels = sym.labels;
      if (!Array.isArray(labels)) fail(`${sp}.labels`, 'must be an array');
      labels.forEach((label: unknown, li: number) => {
        const lp = `${sp}.labels[${li}]`;
        if (!isRecord(label)) fail(lp, 'must be an object');
        if (typeof label.name !== 'string') fail(`${lp}.name`, 'must be a string');
        checkInt(label.frame, `${lp}.frame`, 1, frameCount);
      });
    } else {
      fail(`${sp}.type`, 'must be "shape" or "sprite"');
    }
  }

  const root = Object.prototype.hasOwnProperty.call(symbols, String(rootId))
    ? symbols[String(rootId)]
    : undefined;
  if (!isRecord(root) || root.type !== 'sprite') {
    fail('rootSymbolId', `symbol ${rootId} must exist and be a sprite`);
  }
}

export function parseScene(text: string): SceneJson {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new SceneParseError(`scene is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  validateScene(value);
  return value;
}
