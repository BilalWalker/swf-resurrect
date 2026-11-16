// Container behaviour shared by DisplayObjectContainer and the Stage_Object (as3-coverage task 9, design "Stage as a
// real tree"). Its own module so that Stage.ts can use it without importing Sprite.ts, which imports internal.ts, which
// imports Stage.ts (D13).
import type { DisplayObject } from './DisplayObject';
import { Event } from './events';
import type { ParentNode } from './Stage';

/** The child's subtree, pre-order. */
function subtree(o: DisplayObject): DisplayObject[] {
  const out: DisplayObject[] = [];
  const walk = (n: DisplayObject): void => {
    out.push(n);
    for (const c of (n as Partial<{ _children: DisplayObject[] }>)._children ?? []) walk(c);
  };
  walk(o);
  return out;
}

/** Dispatches `added` on child, then `addedToStage` on it and its descendants when it is on the stage. */
export function announceAdded(child: DisplayObject): void {
  child.dispatchEvent(new Event(Event.ADDED));
  if (!child._onStage()) return;
  for (const o of subtree(child)) o.dispatchEvent(new Event(Event.ADDED_TO_STAGE));
}

/** Dispatches `removed` on child (still attached), then `removedFromStage` on its subtree when it is on the stage. */
export function announceRemoved(child: DisplayObject): void {
  const onStage = child._onStage();
  child.dispatchEvent(new Event(Event.REMOVED));
  if (!onStage) return;
  for (const o of subtree(child)) o.dispatchEvent(new Event(Event.REMOVED_FROM_STAGE));
}

/** Appends `child` at the highest index of `host`; a child already on another list is moved. */
export function addChildTo<T extends DisplayObject>(host: ParentNode, child: T): T {
  for (let p: DisplayObject | ParentNode | null = host; p !== null; p = p._parent) {
    if (p === child) throw new Error('addChild: a display object cannot contain itself or an ancestor');
  }
  const old = child._parent;
  if (old !== null && 'removeChild' in old) old.removeChild(child);
  host._children.push(child);
  child._parent = host;
  announceAdded(child);
  return child;
}

/** Removes `child` from `host`. A non-child throws and leaves the list unchanged (`ArgumentError` on the Stage). */
export function removeChildFrom<T extends DisplayObject>(host: ParentNode, child: T, notChild: () => Error): T {
  if (host._children.indexOf(child) < 0) throw notChild();
  announceRemoved(child);
  // A listener may have moved the child; remove it only if it is still ours.
  const j = host._children.indexOf(child);
  if (j >= 0) {
    host._children.splice(j, 1);
    child._parent = null;
  }
  return child;
}

/** Throws RangeError when the index is out of range, as AS3 does. */
export function getChildAtOf(host: ParentNode, index: number): DisplayObject {
  const child = host._children[index];
  if (!Number.isInteger(index) || child === undefined) {
    throw new RangeError(`getChildAt: index ${index} is out of range`);
  }
  return child;
}

/** Direct children only; first match in index order, or null. */
export function getChildByNameOf(host: ParentNode, name: string): DisplayObject | null {
  return host._children.find((c) => c.name === name) ?? null;
}
