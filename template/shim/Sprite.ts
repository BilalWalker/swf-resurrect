import { DisplayObject } from './DisplayObject';

export class DisplayObjectContainer extends DisplayObject {
  _children: DisplayObject[] = [];

  get numChildren(): number {
    return this._children.length;
  }

  /** Appends at the highest index; a child already on another list is moved. */
  addChild<T extends DisplayObject>(child: T): T {
    for (let p: DisplayObject | null = this; p !== null; p = p._parent) {
      if (p === child) throw new Error('addChild: a display object cannot contain itself or an ancestor');
    }
    child._parent?.removeChild(child);
    this._children.push(child);
    child._parent = this;
    return child;
  }

  removeChild<T extends DisplayObject>(child: T): T {
    const i = this._children.indexOf(child);
    if (i < 0) throw new Error('removeChild: the object is not a child of this container');
    this._children.splice(i, 1);
    child._parent = null;
    return child;
  }

  /** Direct children only; first match in index order, or null. */
  getChildByName(name: string): DisplayObject | null {
    return this._children.find((c) => c.name === name) ?? null;
  }
}

export class Sprite extends DisplayObjectContainer {}
