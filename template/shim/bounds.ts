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
