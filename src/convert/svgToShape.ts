// The Shape_Function (breadth design section 2): FFDec shape or text SVG -> Shape_JSON. Core: no node module, clock,
// randomness or locale call (Requirement 15.2). A pure function of its three inputs.
//
// Built so far (sub-task 10.4): the wrapper, nested `<g transform>`, `<use xlink:href>` resolved to `<defs>`, solid
// fills, one ShapePath per element in SVG order, holes through groupContours. Gradients (sub-task 10.6): built from
// gradientTransform, spreadMethod, stop-opacity and fx/fy; one that `fillIsDrawn(fill, caps)` rejects is left out of the
// Shape_JSON and returned as exactly one Named_Limit (decision D21). Bitmap fills are built by sub-task 10.7, so each is
// a limit whatever `caps` says. Strokes (sub-task 10.5): cap, join, miter limit, width,
// colour and alpha are read; a miter-clip join, a gradient stroke, an unresolved stroke paint and a dash array are each
// returned as a `stroke-style` limit (decided F8). No limit is recorded for a cap (sub-task 11.1 measures caps).
//
// Elements that cannot be read at all (malformed XML, path data outside M L H V Q C Z, non-finite numbers) are
// dropped without a limit: FFDec does not write them, and ShapeLimitKind has no kind for them.

import { XMLParser } from 'fast-xml-parser';
import {
  DRAWN_FILLS,
  type DrawnFills,
  fillIsDrawn,
  type GradientStop,
  type Mat6,
  type PathCmd,
  type ShapeJson,
  type ShapePath,
  type ShapeStroke,
} from '../../template/runtime/shapeJson';
import { groupContours } from './evenOdd';
import { bakeCmds, parsePathD } from './pathData';

export type ShapeLimitKind =
  | 'gradient-fill'
  | 'bitmap-fill'
  | 'gradient-spread'
  | 'gradient-focal'
  | 'bitmap-smoothing'
  | 'stroke-style'
  | 'text-metrics';

export interface ShapeLimit {
  kind: ShapeLimitKind;
  message: string;
}

export interface ShapeBuild {
  shape: ShapeJson;
  images: Array<{ bitmapId: number; ext: 'png' | 'jpg'; bytes: Uint8Array }>;
  limits: ShapeLimit[];
}

type Attrs = Readonly<Record<string, string>>;

interface El {
  tag: string;
  attrs: Attrs;
  children: El[];
}

/** The presentation properties that SVG inherits and this function reads. */
const INHERITED = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
] as const;

type Inherited = Readonly<Record<(typeof INHERITED)[number], string | undefined>>;

const NO_STYLE: Inherited = {
  fill: undefined,
  'fill-opacity': undefined,
  stroke: undefined,
  'stroke-opacity': undefined,
  'stroke-width': undefined,
  'stroke-linecap': undefined,
  'stroke-linejoin': undefined,
  'stroke-miterlimit': undefined,
  'stroke-dasharray': undefined,
};

const IDENTITY: Mat6 = [1, 0, 0, 1, 0, 0];
const MAX_DEPTH = 64;
const NON_RENDERED = new Set(['defs', 'pattern', 'linearGradient', 'radialGradient', 'clipPath', 'mask', 'symbol']);

// ---- XML ----------------------------------------------------------------------------------------------------

const PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

function toEl(item: Record<string, unknown>): El | null {
  const tag = Object.keys(item).find((k) => k !== ':@' && k !== '#text' && !k.startsWith('?'));
  if (tag === undefined) return null;
  const raw = item[':@'];
  const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
  if (typeof raw === 'object' && raw !== null) {
    for (const k of Object.keys(raw)) {
      const v = (raw as Record<string, unknown>)[k];
      if (k.startsWith('@_') && typeof v === 'string') attrs[k.slice(2)] = v;
    }
  }
  const kids = item[tag];
  const children: El[] = [];
  if (Array.isArray(kids)) {
    for (const k of kids) {
      if (typeof k === 'object' && k !== null) {
        const e = toEl(k as Record<string, unknown>);
        if (e !== null) children.push(e);
      }
    }
  }
  return { tag, attrs, children };
}

function parseSvg(svg: string): El | null {
  let doc: unknown;
  try {
    doc = PARSER.parse(svg);
  } catch {
    return null;
  }
  if (!Array.isArray(doc)) return null;
  for (const n of doc) {
    if (typeof n === 'object' && n !== null) {
      const e = toEl(n as Record<string, unknown>);
      if (e !== null && e.tag === 'svg') return e;
    }
  }
  return null;
}

function indexIds(el: El, into: Record<string, El>): void {
  const id = el.attrs.id;
  if (id !== undefined && into[id] === undefined) into[id] = el;
  for (const c of el.children) indexIds(c, into);
}

// ---- numbers, matrices, style ---------------------------------------------------------------------------------

function mul(p: Mat6, c: Mat6): Mat6 {
  return [
    p[0] * c[0] + p[2] * c[1],
    p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3],
    p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4],
    p[1] * c[4] + p[3] * c[5] + p[5],
  ];
}

function numbers(s: string): number[] {
  return s
    .split(/[\s,]+/)
    .filter((t) => t !== '')
    .map(Number);
}

/** `matrix(...)`, `translate(...)` and `scale(...)`, in order; anything else is read as the identity. */
function parseTransform(s: string | undefined): Mat6 {
  if (s === undefined) return IDENTITY;
  let m: Mat6 = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(s)) !== null) {
    const n = numbers(hit[2]!);
    if (n.some((v) => !Number.isFinite(v))) continue;
    let t: Mat6 = IDENTITY;
    if (hit[1] === 'matrix' && n.length === 6) t = [n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!];
    else if (hit[1] === 'translate' && (n.length === 1 || n.length === 2)) t = [1, 0, 0, 1, n[0]!, n[1] ?? 0];
    else if (hit[1] === 'scale' && (n.length === 1 || n.length === 2)) t = [n[0]!, 0, 0, n[1] ?? n[0]!, 0, 0];
    m = mul(m, t);
  }
  return m;
}

/** A presentation property: the `style` declaration wins over the attribute, as in SVG. */
function prop(el: El, name: string): string | undefined {
  const style = el.attrs.style;
  if (style !== undefined) {
    let found: string | undefined;
    for (const decl of style.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0 && decl.slice(0, i).trim() === name) found = decl.slice(i + 1).trim();
    }
    if (found !== undefined) return found;
  }
  const a = el.attrs[name];
  return a === undefined ? undefined : a.trim();
}

function hexColor(s: string): string | null {
  const v = s.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short !== null) return `#${short[1]!}${short[1]!}${short[2]!}${short[2]!}${short[3]!}${short[3]!}`;
  return null;
}

function alphaOf(s: string | undefined): number {
  if (s === undefined) return 1;
  const v = Number(s);
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v)) + 0;
}

function urlId(paint: string): string | null {
  const m = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(paint);
  return m === null ? null : m[1]!;
}

// ---- the builder ----------------------------------------------------------------------------------------------

class Builder {
  readonly paths: ShapePath[] = [];
  readonly limits: ShapeLimit[] = [];
  private fills = 0; // gradient and bitmap fills seen so far in this shape, drawn or not (the 1-based ordinal)
  private wrapperSeen = false;

  constructor(
    private readonly ids: Record<string, El>,
    private readonly caps: DrawnFills,
  ) {}

  walk(el: El, m: Mat6, inh: Inherited, depth: number, useStack: readonly string[]): void {
    if (depth > MAX_DEPTH || NON_RENDERED.has(el.tag)) return;
    switch (el.tag) {
      case 'svg':
        for (const c of el.children) this.walk(c, m, this.inherit(el, inh), depth + 1, useStack);
        return;
      case 'g': {
        let next = m;
        if (el.attrs.transform !== undefined) {
          if (!this.wrapperSeen) this.wrapperSeen = true; // the first transformed <g> is the shape origin
          else next = mul(m, parseTransform(el.attrs.transform));
        }
        const style = this.inherit(el, inh);
        for (const c of el.children) this.walk(c, next, style, depth + 1, useStack);
        return;
      }
      case 'use': {
        const href = el.attrs['xlink:href'] ?? el.attrs.href;
        if (href === undefined || !href.startsWith('#')) return;
        const id = href.slice(1);
        const target = this.ids[id];
        if (target === undefined || useStack.includes(id)) return;
        const next = mul(m, parseTransform(el.attrs.transform));
        const style = this.inherit(el, inh);
        const stack = [...useStack, id];
        // The referenced element is drawn in place; a referenced <g> contributes its own transform too.
        if (target.tag === 'g') {
          const own = mul(next, parseTransform(target.attrs.transform));
          const ts = this.inherit(target, style);
          for (const c of target.children) this.walk(c, own, ts, depth + 1, stack);
        } else {
          this.walk(target, next, style, depth + 1, stack);
        }
        return;
      }
      case 'path':
        this.path(el, m, inh);
        return;
      default:
        return;
    }
  }

  private inherit(el: El, inh: Inherited): Inherited {
    const next: Record<string, string | undefined> = {};
    for (const name of INHERITED) next[name] = prop(el, name) ?? inh[name];
    return next as Inherited;
  }

  private path(el: El, m: Mat6, inh: Inherited): void {
    const own = this.inherit(el, inh);
    const paint = own.fill ?? '#000000';
    let fill: ShapePath['fill'] = null;
    if (paint !== 'none') {
      const solid = hexColor(paint);
      if (solid === null) fill = this.nonSolidFill(el, paint, m);
      else fill = { kind: 'solid', color: solid, alpha: alphaOf(own['fill-opacity']) };
    }
    const stroke = this.strokeOf(own, m);
    if (fill === null && stroke === null) return;
    const d = el.attrs.d;
    if (d === undefined) return;
    let cmds: PathCmd[];
    try {
      cmds = bakeCmds(parsePathD(d), m);
    } catch {
      return;
    }
    if (cmds.some((c) => c.some((v) => typeof v === 'number' && !Number.isFinite(v)))) return;
    const subpaths: PathCmd[][] = [];
    for (const c of cmds) {
      if (c[0] === 'M') subpaths.push([c]);
      else subpaths[subpaths.length - 1]?.push(c);
    }
    if (subpaths.length === 0) return;
    // A path without a fill keeps every subpath as its own outer contour (design section 2).
    const contours = fill === null ? subpaths.map((outer) => ({ outer, holes: [] })) : groupContours(subpaths);
    this.paths.push({ contours, fill, stroke });
  }

  /** The stroke of a path, or null. Records a `stroke-style` limit for every part it cannot keep as written. */
  private strokeOf(st: Inherited, m: Mat6): ShapeStroke | null {
    const paint = st.stroke;
    if (paint === undefined || paint === 'none') return null;
    const color = hexColor(paint);
    if (color === null) {
      this.limits.push({
        kind: 'stroke-style',
        message: urlId(paint) !== null ? 'gradient stroke is not drawn' : 'stroke paint is not resolved and is not drawn',
      });
      return null;
    }
    const dash = st['stroke-dasharray'];
    if (dash !== undefined && dash !== 'none' && dash !== '') {
      this.limits.push({ kind: 'stroke-style', message: 'approximated: dash array is not drawn, the stroke is solid' });
    }
    const joinText = st['stroke-linejoin'];
    let join: ShapeStroke['join'] = 'miter';
    if (joinText === 'round' || joinText === 'bevel' || joinText === 'miter') join = joinText;
    else if (joinText !== undefined) {
      // F8: Pixi has no miter-clip join; it is drawn as miter. Any other unknown spelling is read the same way.
      this.limits.push({ kind: 'stroke-style', message: `approximated: ${joinText} join is drawn as miter` });
    }
    const capText = st['stroke-linecap'];
    const cap: ShapeStroke['cap'] = capText === 'round' || capText === 'square' ? capText : 'butt';
    const limit = Number(st['stroke-miterlimit'] ?? 4);
    const miterLimit = Number.isFinite(limit) ? Math.max(1, limit) : 4;
    const w = Number(st['stroke-width'] ?? 1);
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); // strokes scale with the baked transform
    const width = Number.isFinite(w) && w >= 0 ? w * scale : scale;
    return {
      color,
      alpha: alphaOf(st['stroke-opacity']),
      width: Number.isFinite(width) ? width + 0 : 1,
      cap,
      join,
      miterLimit: miterLimit + 0,
    };
  }

  /**
   * A fill that is not a solid colour. A gradient that `fillIsDrawn` accepts is returned (with its finer limits); every
   * other gradient or bitmap fill is returned as null and named by exactly one Named_Limit (decision D21). Bitmap
   * fills are built by sub-task 10.7; until then each one is named whatever `caps` says.
   */
  private nonSolidFill(el: El, paint: string, m: Mat6): ShapePath['fill'] {
    this.fills++;
    const n = this.fills;
    const id = urlId(paint);
    const target = id === null ? undefined : this.ids[id];
    if (target !== undefined && (target.tag === 'linearGradient' || target.tag === 'radialGradient')) {
      const g = this.gradient(target, m);
      if (g !== null && fillIsDrawn(g, this.caps)) {
        this.gradientLimits(g);
        return g;
      }
    }
    this.undrawnFill(el, paint, n);
    return null;
  }

  /** The gradient as Shape_JSON, or null when it has fewer than two readable stops or a bad matrix. */
  private gradient(g: El, m: Mat6): Extract<ShapePath['fill'], { kind: 'gradient' }> | null {
    const stops: GradientStop[] = [];
    for (const s of g.children) {
      if (s.tag !== 'stop') continue;
      const color = hexColor(prop(s, 'stop-color') ?? '#000000');
      const offset = Number(s.attrs.offset ?? 0);
      if (color === null || !Number.isFinite(offset)) return null;
      stops.push({ offset: Math.min(1, Math.max(0, offset)) + 0, color, alpha: alphaOf(prop(s, 'stop-opacity')) });
    }
    if (stops.length < 2) return null;
    // Array.prototype.sort is stable, so equal offsets keep their SVG order.
    stops.sort((a, b) => a.offset - b.offset);
    // FFDec writes the SWF gradient square (x1/x2 = -819.2/819.2, r = 819.2) and puts the placement in
    // gradientTransform, so the transform is the whole matrix. The enclosing baked transform comes first.
    const matrix = mul(m, parseTransform(g.attrs.gradientTransform)).map((v) => v + 0) as Mat6;
    if (matrix.some((v) => !Number.isFinite(v))) return null;
    const sm = g.attrs.spreadMethod;
    const spread: 'pad' | 'reflect' | 'repeat' = sm === 'reflect' || sm === 'repeat' ? sm : 'pad';
    const type = g.tag === 'radialGradient' ? 'radial' : 'linear';
    const out: Extract<ShapePath['fill'], { kind: 'gradient' }> = { kind: 'gradient', type, matrix, stops, spread };
    if (type === 'radial' && g.attrs.fx !== undefined) {
      const fx = Number(g.attrs.fx);
      const fy = Number(g.attrs.fy ?? g.attrs.fx);
      const cx = Number(g.attrs.cx ?? 0);
      const cy = Number(g.attrs.cy ?? 0);
      // A focal point on the centre is a plain radial gradient.
      if (Number.isFinite(fx) && Number.isFinite(fy) && (fx !== cx || fy !== cy)) out.focal = { x: fx + 0, y: fy + 0 };
    }
    return out;
  }

  /** The finer limits of a drawn radial gradient (design 2, Requirement 8.4). Linear gradients record nothing. */
  private gradientLimits(g: Extract<ShapePath['fill'], { kind: 'gradient' }>): void {
    if (g.type !== 'radial') return;
    if (g.spread !== 'pad') {
      this.limits.push({ kind: 'gradient-spread', message: `radial gradient with spreadMethod ${g.spread} is not drawn` });
    }
    if (g.focal !== undefined) {
      this.limits.push({
        kind: 'gradient-focal',
        message: 'approximated: radial gradient focal point is drawn by the canvas gradient and not verified',
      });
    }
  }

  /** D21: one Named_Limit per gradient or bitmap fill, numbered by position among those fills of the shape. */
  private undrawnFill(el: El, paint: string, n: number): void {
    const id = urlId(paint);
    const target = id === null ? undefined : this.ids[id];
    if (target !== undefined && (target.tag === 'linearGradient' || target.tag === 'radialGradient')) {
      const stops = target.children.filter((c) => c.tag === 'stop').length;
      const type = target.tag === 'linearGradient' ? 'linear' : 'radial';
      this.limits.push({ kind: 'gradient-fill', message: `gradient fill ${n} is not drawn (${type}, ${stops} stops)` });
    } else if (target !== undefined && target.tag === 'pattern') {
      const image = el.attrs['ffdec:fill-bitmapId'] ?? target.attrs['ffdec:fill-bitmapId'];
      const label = image !== undefined && /^[0-9]+$/.test(image) ? `image ${image}` : 'image unknown';
      this.limits.push({ kind: 'bitmap-fill', message: `bitmap fill ${n} is not drawn (${label})` });
    } else if (id !== null && id.startsWith('PatternID')) {
      this.limits.push({ kind: 'bitmap-fill', message: `bitmap fill ${n} is not drawn (pattern unresolved)` });
    } else {
      this.limits.push({ kind: 'gradient-fill', message: `gradient fill ${n} is not drawn (paint unresolved)` });
    }
  }
}

function sortLimits(limits: ShapeLimit[]): ShapeLimit[] {
  const sorted = [...limits].sort((a, b) =>
    a.kind !== b.kind ? (a.kind < b.kind ? -1 : 1) : a.message < b.message ? -1 : a.message > b.message ? 1 : 0,
  );
  return sorted.filter((l, i) => i === 0 || l.kind !== sorted[i - 1]!.kind || l.message !== sorted[i - 1]!.message);
}

/**
 * Converts one FFDec SVG. Deterministic and total: it never throws, the Shape_JSON it returns is valid, and `limits`
 * is sorted by (kind, message) without duplicates. `caps` is what the backend draws: a gradient it does not draw is left
 * out and named (decision D21).
 */
export function svgToShapeJson(svg: string, _kind: 'shape' | 'text', caps: DrawnFills = DRAWN_FILLS): ShapeBuild {
  const root = parseSvg(svg);
  const empty: ShapeBuild = { shape: { formatVersion: 1, paths: [] }, images: [], limits: [] };
  if (root === null) return empty;
  const ids: Record<string, El> = Object.create(null) as Record<string, El>;
  indexIds(root, ids);
  const b = new Builder(ids, caps);
  b.walk(root, IDENTITY, NO_STYLE, 0, []);
  return { shape: { formatVersion: 1, paths: b.paths }, images: [], limits: sortLimits(b.limits) };
}
