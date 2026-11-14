// The Shape_Function (breadth design section 2): FFDec shape or text SVG -> Shape_JSON. Core: no node module, clock,
// randomness or locale call (Requirement 15.2). A pure function of its three inputs.
//
// Built so far (sub-task 10.4): the wrapper, nested `<g transform>`, `<use xlink:href>` resolved to `<defs>`, solid
// fills, one ShapePath per element in SVG order, holes through groupContours. A gradient or bitmap fill is returned as
// exactly one Named_Limit and left out of the Shape_JSON (decision D21): their construction arrives with the drawing
// tasks, so every such fill is a limit whatever `caps` says. Strokes are sub-task 10.5 and are not read yet.
//
// Elements that cannot be read at all (malformed XML, path data outside M L H V Q C Z, non-finite numbers) are
// dropped without a limit: FFDec does not write them, and ShapeLimitKind has no kind for them.

import { XMLParser } from 'fast-xml-parser';
import { DRAWN_FILLS, type DrawnFills, type Mat6, type PathCmd, type ShapeJson, type ShapePath } from '../../template/runtime/shapeJson';
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

interface Inherited {
  fill: string | undefined;
  fillOpacity: string | undefined;
}

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
  private undrawn = 0;
  private wrapperSeen = false;

  constructor(private readonly ids: Record<string, El>) {}

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
    return { fill: prop(el, 'fill') ?? inh.fill, fillOpacity: prop(el, 'fill-opacity') ?? inh.fillOpacity };
  }

  private path(el: El, m: Mat6, inh: Inherited): void {
    const own = this.inherit(el, inh);
    const paint = own.fill ?? '#000000';
    if (paint === 'none') return; // stroke-only element: strokes are sub-task 10.5
    const solid = hexColor(paint);
    if (solid === null) {
      this.undrawnFill(el, paint);
      return;
    }
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
    this.paths.push({
      contours: groupContours(subpaths),
      fill: { kind: 'solid', color: solid, alpha: alphaOf(own.fillOpacity) },
      stroke: null,
    });
  }

  /** D21: one Named_Limit per gradient or bitmap fill, numbered by position among those fills of the shape. */
  private undrawnFill(el: El, paint: string): void {
    this.undrawn++;
    const n = this.undrawn;
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
 * is sorted by (kind, message) without duplicates. `caps` is what the backend draws; see the header for why it does not
 * change the result yet.
 */
export function svgToShapeJson(svg: string, _kind: 'shape' | 'text', caps: DrawnFills = DRAWN_FILLS): ShapeBuild {
  void caps;
  const root = parseSvg(svg);
  const empty: ShapeBuild = { shape: { formatVersion: 1, paths: [] }, images: [], limits: [] };
  if (root === null) return empty;
  const ids: Record<string, El> = Object.create(null) as Record<string, El>;
  indexIds(root, ids);
  const b = new Builder(ids);
  b.walk(root, IDENTITY, { fill: undefined, fillOpacity: undefined }, 0, []);
  return { shape: { formatVersion: 1, paths: b.paths }, images: [], limits: sortLimits(b.limits) };
}
