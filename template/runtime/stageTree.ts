import type { DisplayObject } from '../shim/DisplayObject';
import { Shape } from '../shim/Shape';
import { TextField } from '../shim/TextField';
import type { DisplayObjectContainer } from '../shim/Sprite';
import { isStage, type Stage } from '../shim/Stage';
import type { NodeHandle, RenderBackend, ShapeBounds } from './backend';
import type { HitArea, HitNode } from './hitTest';
import { namedLimit } from '../shim/errorSink';
import { planGraphics } from './graphicsPlan';
import type { Matrix6 } from './scene';

/** Leaf display object for a shape symbol. Carries its bounds for hit testing. */
export class ShapeObject extends Shape {
  constructor(
    readonly symbolId: number,
    readonly bounds: ShapeBounds,
  ) {
    super();
    this._intrinsicWidth = bounds.width;
    this._intrinsicHeight = bounds.height;
  }
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
}

function norm(v: number): number {
  return v === 0 ? 0 : v; // -0 becomes 0
}

/** Matrix (a b c d tx ty) to translation, scale and rotation. Returns whether a skew was dropped. */
export function decomposeMatrix(m: Readonly<Matrix6>): { t: Transform; skewed: boolean } {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  const scaleX = Math.hypot(a, b);
  const scaleY = (det < 0 ? -1 : 1) * Math.hypot(c, d);
  const rotationDeg = (Math.atan2(b, a) * 180) / Math.PI;
  // Columns (a,b) and (c,d) must be perpendicular for the decomposition to be exact.
  const skewed = Math.abs(a * c + b * d) > 1e-9 * Math.max(1, scaleX * Math.abs(scaleY));
  return {
    t: { x: norm(tx), y: norm(ty), scaleX: norm(scaleX), scaleY: norm(scaleY), rotationDeg: norm(rotationDeg) },
    skewed,
  };
}

interface NodeRecord {
  node: NodeHandle;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  alpha: number;
  visible: boolean;
  /** The Graphics and its version last pushed; version -1 when nothing was pushed. */
  gfxVersion: number;
  /** The TextField state last pushed, as one key; null when none was pushed. */
  textKey: string | null;
}

/** Maps display objects to backend nodes and remembers what was last pushed to each. */
export class NodeRegistry {
  private readonly records = new WeakMap<DisplayObject, NodeRecord>();

  register(obj: DisplayObject, node: NodeHandle): void {
    this.records.set(obj, {
      node,
      x: obj.x,
      y: obj.y,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      rotationDeg: obj.rotation,
      alpha: 1,
      visible: true,
      gfxVersion: -1,
      textKey: null,
    });
  }

  nodeOf(obj: DisplayObject): NodeHandle | undefined {
    return this.records.get(obj)?.node;
  }

  /** Sets the object's transform fields and pushes them to the backend. */
  applyTransform(backend: RenderBackend, obj: DisplayObject, t: Transform): void {
    obj.x = t.x;
    obj.y = t.y;
    obj.scaleX = t.scaleX;
    obj.scaleY = t.scaleY;
    obj.rotation = t.rotationDeg;
    this.push(backend, obj);
  }

  /**
   * Pushes any x, y, scale, rotation, alpha or visible value that scripts
   * changed since the last push, for the whole subtree.
   */
  syncTree(backend: RenderBackend, obj: DisplayObject): void {
    this.push(backend, obj);
    const children = (obj as Partial<DisplayObjectContainer>)._children;
    if (children) for (const c of children) this.syncTree(backend, c);
  }

  private push(backend: RenderBackend, obj: DisplayObject): void {
    const r = this.records.get(obj);
    if (r === undefined) return;
    if (
      r.x !== obj.x ||
      r.y !== obj.y ||
      r.scaleX !== obj.scaleX ||
      r.scaleY !== obj.scaleY ||
      r.rotationDeg !== obj.rotation
    ) {
      r.x = obj.x;
      r.y = obj.y;
      r.scaleX = obj.scaleX;
      r.scaleY = obj.scaleY;
      r.rotationDeg = obj.rotation;
      backend.setTransform(r.node, { x: r.x, y: r.y, scaleX: r.scaleX, scaleY: r.scaleY, rotationDeg: r.rotationDeg });
    }
    if (r.alpha !== obj.alpha) {
      r.alpha = obj.alpha;
      backend.setAlpha(r.node, r.alpha);
    }
    // Requirement 14.13: only graphics whose version changed are planned and pushed.
    const gfx = obj._gfx;
    if (gfx !== null && gfx.version !== r.gfxVersion) {
      r.gfxVersion = gfx.version;
      backend.setGraphics(r.node, gfx._prims.length === 0 ? null : planGraphics(gfx._prims));
    }
    if (obj instanceof TextField) {
      const key = JSON.stringify([obj.text, obj.textColor, obj.width, obj.height]);
      if (key !== r.textKey) {
        r.textKey = key;
        backend.setText(r.node, obj.text === '' ? null : { text: obj.text, color: obj.textColor, width: obj.width, height: obj.height });
      }
    }
    if (r.visible !== obj.visible) {
      r.visible = obj.visible;
      backend.setVisible(r.node, r.visible);
    }
  }
}

/**
 * Deterministic name of a pointer target for reports: `stage` for the Stage_Object, otherwise the `name`
 * chain from the root down (`root1.beetle`), with `#<child index>` for an empty name.
 */
export function describeTarget(obj: DisplayObject | Stage): string {
  if (isStage(obj)) return 'stage';
  const parts: string[] = [];
  for (let o: DisplayObject | Stage | null = obj; o !== null && !isStage(o); o = o._parent) {
    const parent: DisplayObject['_parent'] = o._parent;
    if (o.name !== '') parts.push(o.name);
    else parts.push(`#${parent === null ? 0 : parent._children.indexOf(o)}`);
  }
  return parts.reverse().join('.');
}

/** Snapshot of a display subtree in the shape hitTest expects. */
export interface HitView extends HitNode {
  source: DisplayObject;
  /** Set on the synthetic leaf that carries the code-drawn fills of this object: a non-interactive leaf of its owner. */
  gfxOf?: DisplayObject;
  children: HitView[];
}

/**
 * `isMask` names the mask placements (Scene_JSON `clipDepth`): a mask layer is not a hit target in Flash, so the mask
 * and everything below it are left out of the view.
 */
export function buildHitView(obj: DisplayObject, isMask: (o: DisplayObject) => boolean = () => false): HitView {
  const kids = ((obj as Partial<DisplayObjectContainer>)._children ?? []).filter((k) => !isMask(k));
  const view: HitView = {
    source: obj,
    x: obj.x,
    y: obj.y,
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
    rotation: obj.rotation,
    visible: obj.visible,
    children: kids.map((k) => buildHitView(k, isMask)),
  };
  const areas = graphicsAreas(obj);
  // Graphics draw below the children, so the leaf goes first (topmost-last order).
  if (areas.length > 0) view.children.unshift({ source: obj, gfxOf: obj, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, visible: true, children: [], areas });
  if (obj instanceof ShapeObject) return { ...view, bounds: obj.bounds };
  // A TextField is hit over its whole box, empty or not (Ruffle: the box is the hit area).
  if (obj instanceof TextField) return { ...view, bounds: { x: 0, y: 0, width: obj.width, height: obj.height } };
  return view;
}

/**
 * Hit areas of the fills drawn with graphics (circles and polygons with a fill). Strokes are not hit-tested: a
 * stroke-only draw is not a hit area and raises Named_Limit graphics-stroke-not-hit (Flash hits the stroke area).
 */
function graphicsAreas(obj: DisplayObject): HitArea[] {
  const gfx = obj._gfx;
  if (gfx === null || gfx._prims.length === 0) return [];
  const areas: HitArea[] = [];
  for (const d of planGraphics(gfx._prims)) {
    if (d.fill === null) {
      if (d.stroke !== null) namedLimit('graphics-stroke-not-hit', 'a stroke drawn with graphics is not a hit area; only fills are hit-tested');
    } else if (d.kind === 'circle') areas.push({ kind: 'circle', x: d.x, y: d.y, r: d.r });
    else areas.push({ kind: 'polygon', points: d.points });
  }
  return areas;
}
