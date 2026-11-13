import type { DisplayObject } from '../shim/DisplayObject';
import { Shape } from '../shim/Shape';
import type { DisplayObjectContainer } from '../shim/Sprite';
import { isStage, type Stage } from '../shim/Stage';
import type { NodeHandle, RenderBackend, ShapeBounds } from './backend';
import type { HitNode } from './hitTest';
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
  children: HitView[];
}

export function buildHitView(obj: DisplayObject): HitView {
  const kids = (obj as Partial<DisplayObjectContainer>)._children ?? [];
  const view: HitView = {
    source: obj,
    x: obj.x,
    y: obj.y,
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
    rotation: obj.rotation,
    visible: obj.visible,
    children: kids.map(buildHitView),
  };
  return obj instanceof ShapeObject ? { ...view, bounds: obj.bounds } : view;
}
