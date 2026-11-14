/**
 * Residual attribution (Requirement 21.2, 21.3, 21.7; design section 17). Core: pure, no IO.
 * A register is the committed data file `samples/<name>/residual-causes.json`.
 */
import type { VisualLimit } from './limits';
import type { Bbox, DiffRegion } from './regions';

/** `kind` matches /^[a-z][a-z0-9-]*$/. `bbox` is inclusive pixel coordinates, as DiffRegion.bbox. */
export interface ResidualEntry {
  frame: number;
  bbox: Bbox;
  kind: string;
  message: string;
}

export interface ResidualRegister {
  formatVersion: 1;
  sample: string;
  entries: ResidualEntry[];
}

/** The message starts with the path of the failing field. */
export class ResidualRegisterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResidualRegisterError';
  }
}

export interface Attribution {
  frame: number;
  region: DiffRegion;
  entry: ResidualEntry | null;
}

const KIND_PATTERN = /^[a-z][a-z0-9-]*$/;
const FORBIDDEN_MESSAGES: ReadonlySet<string> = new Set(['unknown', 'not examined', 'todo', 'tbd']);

function fail(path: string, what: string): never {
  throw new ResidualRegisterError(`${path}: ${what}`);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function coord(path: string, v: unknown, limit: number | null): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return fail(path, 'must be an integer');
  if (v < 0) return fail(path, 'must not be negative');
  if (limit !== null && v >= limit) return fail(path, `must be below the stage size ${limit}`);
  return v;
}

/**
 * Throws ResidualRegisterError naming the failing field. `stage` (the Scene_JSON stage size in pixels) bounds the
 * boxes when given; without it a box must still be non-negative and ordered. A guard against the forbidden
 * outcome "cause not examined" (Requirement 21.3), not a proof of examination.
 */
export function validateResidualRegister(
  x: unknown,
  stage?: { width: number; height: number },
): asserts x is ResidualRegister {
  if (!isRecord(x)) return fail('register', 'must be an object');
  if (x['formatVersion'] !== 1) fail('formatVersion', 'must be 1');
  if (typeof x['sample'] !== 'string' || x['sample'] === '') fail('sample', 'must be a non-empty string');
  const entries = x['entries'];
  if (!Array.isArray(entries)) return fail('entries', 'must be an array');
  entries.forEach((raw: unknown, i) => {
    const p = `entries[${i}]`;
    if (!isRecord(raw)) return fail(p, 'must be an object');
    const frame = raw['frame'];
    if (typeof frame !== 'number' || !Number.isInteger(frame)) fail(`${p}.frame`, 'must be an integer');
    const b = raw['bbox'];
    if (!isRecord(b)) return fail(`${p}.bbox`, 'must be an object');
    const w = stage?.width ?? null;
    const h = stage?.height ?? null;
    const x0 = coord(`${p}.bbox.x0`, b['x0'], w);
    const y0 = coord(`${p}.bbox.y0`, b['y0'], h);
    const x1 = coord(`${p}.bbox.x1`, b['x1'], w);
    const y1 = coord(`${p}.bbox.y1`, b['y1'], h);
    if (x1 < x0) fail(`${p}.bbox.x1`, 'must not be below x0');
    if (y1 < y0) fail(`${p}.bbox.y1`, 'must not be below y0');
    const kind = raw['kind'];
    if (typeof kind !== 'string' || !KIND_PATTERN.test(kind)) fail(`${p}.kind`, 'must match /^[a-z][a-z0-9-]*$/');
    const message = raw['message'];
    if (typeof message !== 'string' || message.trim() === '') fail(`${p}.message`, 'must be a non-empty string');
    if (FORBIDDEN_MESSAGES.has((message as string).trim().toLowerCase())) {
      fail(`${p}.message`, 'must state what differs, not "unknown", "not examined", "todo" or "tbd"');
    }
  });
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0; // UTF-16 code unit order
}

function area(b: Bbox): number {
  return (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
}

function contains(outer: Bbox, inner: Bbox): boolean {
  return outer.x0 <= inner.x0 && outer.y0 <= inner.y0 && outer.x1 >= inner.x1 && outer.y1 >= inner.y1;
}

/** Smaller area first, then (kind, message) in code-unit order. */
function better(a: ResidualEntry, b: ResidualEntry): boolean {
  const d = area(a.bbox) - area(b.bbox) || cmpStr(a.kind, b.kind) || cmpStr(a.message, b.message);
  return d < 0;
}

/**
 * One attribution per region, in region order. The entry is the containing entry of the same frame with the
 * smallest box area (ties by kind, then message); null when none contains the region or there is no register.
 * Independent of the order of the register's entries.
 */
export function attributeRegions(
  frame: number,
  regions: readonly DiffRegion[],
  register: ResidualRegister | null,
): Attribution[] {
  const entries = register === null ? [] : register.entries.filter((e) => e.frame === frame);
  return regions.map((region) => {
    let best: ResidualEntry | null = null;
    for (const e of entries) {
      if (!contains(e.bbox, region.bbox)) continue;
      if (best === null || better(e, best)) best = e;
    }
    return { frame, region, entry: best };
  });
}

/**
 * One `residual-difference` limit per entry used by an attribution (id = the frame), ordered by (frame, kind,
 * message, box) and without duplicates.
 */
export function residualLimits(attributions: readonly Attribution[]): VisualLimit[] {
  const used = new Map<string, ResidualEntry>();
  for (const a of attributions) {
    const e = a.entry;
    if (e === null) continue;
    const b = e.bbox;
    used.set(`${e.frame}\u0000${e.kind}\u0000${e.message}\u0000${b.x0},${b.y0},${b.x1},${b.y1}`, e);
  }
  const entries = [...used.values()].sort(
    (a, b) =>
      a.frame - b.frame ||
      cmpStr(a.kind, b.kind) ||
      cmpStr(a.message, b.message) ||
      a.bbox.x0 - b.bbox.x0 ||
      a.bbox.y0 - b.bbox.y0 ||
      a.bbox.x1 - b.bbox.x1 ||
      a.bbox.y1 - b.bbox.y1,
  );
  return entries.map((e) => ({
    kind: 'residual-difference',
    id: e.frame,
    message: `${e.kind}: ${e.message} (frame ${e.frame}, box ${e.bbox.x0},${e.bbox.y0}-${e.bbox.x1},${e.bbox.y1})`,
  }));
}
