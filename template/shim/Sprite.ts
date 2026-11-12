import { DisplayObject } from './DisplayObject';
import { Event } from './events';
import type { ParentNode } from './Stage';

export class DisplayObjectContainer extends DisplayObject {
  _children: DisplayObject[] = [];

  get numChildren(): number {
    return this._children.length;
  }

  /** Appends at the highest index; a child already on another list is moved. */
  addChild<T extends DisplayObject>(child: T): T {
    for (let p: DisplayObject | ParentNode | null = this; p !== null; p = p._parent) {
      if (p === child) throw new Error('addChild: a display object cannot contain itself or an ancestor');
    }
    const old = child._parent;
    if (old !== null && 'removeChild' in old) old.removeChild(child);
    this._children.push(child);
    child._parent = this;
    announceAdded(child);
    return child;
  }

  removeChild<T extends DisplayObject>(child: T): T {
    const i = this._children.indexOf(child);
    if (i < 0) throw new Error('removeChild: the object is not a child of this container');
    announceRemoved(child);
    // A listener may have moved the child; remove it only if it is still ours.
    const j = this._children.indexOf(child);
    if (j >= 0) {
      this._children.splice(j, 1);
      child._parent = null;
    }
    return child;
  }

  /** Throws RangeError when the index is out of range, as AS3 does. */
  getChildAt(index: number): DisplayObject {
    const child = this._children[index];
    if (!Number.isInteger(index) || child === undefined) {
      throw new RangeError(`getChildAt: index ${index} is out of range`);
    }
    return child;
  }

  /** Direct children only; first match in index order, or null. */
  getChildByName(name: string): DisplayObject | null {
    return this._children.find((c) => c.name === name) ?? null;
  }
}

export class Sprite extends DisplayObjectContainer {}

/** The child and its descendants, pre-order. */
function subtree(o: DisplayObject): DisplayObject[] {
  const out: DisplayObject[] = [];
  const walk = (n: DisplayObject): void => {
    out.push(n);
    for (const c of (n as Partial<DisplayObjectContainer>)._children ?? []) walk(c);
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
