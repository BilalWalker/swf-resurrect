import { IDENTITY, invert, multiply, transformBox, transformMatrix, unionBox, type Affine, type Box } from '../runtime/affine';
import type { DisplayObject } from './DisplayObject';
import type { DisplayObjectContainer } from './Sprite';
import { namedLimit } from './errorSink';
import { Rectangle } from './Rectangle';
import { isStage, type Stage } from './Stage';

/**
 * The one bounds routine behind `getBounds`, `pixelsOverlap` (through `concatenatedAffine`) and Block D
 * (as3-coverage D20). Content is the Shape_JSON bounds of shape symbols and, recursively, the children; each child
 * contributes the axis-aligned box of its transformed box, level by level (Ruffle: "doesn't produce as tight of an
 * AABB ... matches Flash's behavior"). Code-drawn graphics and text boxes are not counted (Named_Limit
 * `getBounds-content-ignored`).
 */
function localContent(obj: DisplayObject): Box | null {
  let box: Box | null = obj._shapeBounds;
  const gfx = obj._gfx;
  if ((gfx !== null && gfx._prims.length > 0) || 'textWidth' in obj) {
    namedLimit('getBounds-content-ignored', 'getBounds does not count code-drawn graphics or TextField boxes');
  }
  const children = (obj as Partial<DisplayObjectContainer>)._children;
  if (children) for (const c of children) box = unionBox(box, contribution(c));
  return box;
}

function contribution(child: DisplayObject): Box | null {
  const inner = localContent(child);
  return inner === null ? null : transformBox(transformMatrix(child), inner);
}

/**
 * Size of the content of a container in its parent's space (the box of its transformed content box): AS3 `width` and
 * `height` of a Sprite or MovieClip. Empty content gives 0 x 0.
 */
export function containerSize(obj: DisplayObject): { width: number; height: number } {
  const b = contribution(obj);
  return b === null ? { width: 0, height: 0 } : { width: b.width, height: b.height };
}

/**
 * Setter of `width` (axis 'w') or `height` ('h') for content-sized objects. The getter is
 * W = |sx|*|cos|*w + |sy|*|sin|*h (H swaps the two terms) for a local content box w x h, so the setter solves for
 * the scale of the same axis and leaves the other. Not implemented (value left unchanged): empty content, a
 * rotation of 90 or 180 degrees where the axis term is 0 (Flash's rule there was neither read nor measured), a
 * request that would need a negative scale, a non-finite request.
 */
export function setContentSize(obj: DisplayObject, axis: 'w' | 'h', v: number): void {
  if (!Number.isFinite(v) || v < 0) return;
  const local = localContent(obj);
  if (local === null) return;
  const rad = (obj.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const { width: w, height: h } = local;
  if (axis === 'w') {
    const own = c * w;
    if (own < 1e-9) return;
    const rest = Math.abs(obj.scaleY) * s * h;
    if (v < rest) return;
    obj.scaleX = Math.sign(obj.scaleX || 1) * ((v - rest) / own);
  } else {
    const own = c * h;
    if (own < 1e-9) return;
    const rest = Math.abs(obj.scaleX) * s * w;
    if (v < rest) return;
    obj.scaleY = Math.sign(obj.scaleY || 1) * ((v - rest) / own);
  }
}

/** The matrix from `obj` to the Stage_Object's space: the transforms of the parent chain, the object's own first. */
export function concatenatedAffine(obj: DisplayObject | Stage | null): Affine {
  let m: Affine = IDENTITY;
  for (let p: DisplayObject | Stage | null = obj; p !== null && !isStage(p); p = p._parent) m = multiply(transformMatrix(p), m);
  return m;
}

/**
 * Bounds of the content of `obj` in the coordinate space of `space`. `space` null or `obj` itself gives the object's
 * own space (its content without its own transform); the Stage_Object is the stage space; another object gives the
 * axis-aligned box of the transformed local box. Empty content gives the zero rectangle (Ruffle `get_dobj_bounds`
 * returns `Rectangle::ZERO` for invalid bounds: read earlier, not read again; Open_Item for task 30).
 */
export function contentBounds(obj: DisplayObject, space: DisplayObject | Stage | null): Rectangle {
  const local = localContent(obj);
  if (local === null) return new Rectangle(0, 0, 0, 0);
  if (space === null || space === obj) return new Rectangle(local.x, local.y, local.width, local.height);
  const into = invert(concatenatedAffine(space));
  if (into === null) return new Rectangle(0, 0, 0, 0);
  const b = transformBox(multiply(into, concatenatedAffine(obj)), local);
  return new Rectangle(b.x, b.y, b.width, b.height);
}
