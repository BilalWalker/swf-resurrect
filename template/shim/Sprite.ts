import { DisplayObject } from './DisplayObject';
import type { DisplayListEntry } from '../runtime/scene';
import { Event } from './events';
import {
  attachChild,
  clipsPostOrder,
  clipsPreOrder,
  defaultInstanceName,
  detachChild,
  isAttachedTo,
  registerClassName,
  takeConstructionContext,
  takeInstanceNumber,
  type ClipScripts,
  type ConstructionContext,
} from './internal';
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

/** A child created from the timeline and the display-list entry it was created from. */
export interface TimelineChild {
  child: DisplayObject;
  entry: DisplayListEntry;
}

/**
 * A Sprite has one frame. When the Player (or a script `new Cls()`, D39) supplies a ConstructionContext, this
 * constructor consumes it, as Ruffle's Sprite constructor does (`super(); this.constructChildren();`), and builds and
 * binds the frame-1 children before any derived field initialiser or constructor statement runs (Requirement 24,
 * D24). MovieClip inherits that and adds the timeline on top: it reads `_ctx` and never takes the context again, so a
 * context is consumed once per instance and frame 1 is built once.
 *
 * The timeline child bookkeeping lives here, not in MovieClip, because a MovieClip's own field initialisers have not
 * run while this constructor is running.
 */
export class Sprite extends DisplayObjectContainer {
  /** The context this instance was built from; null for a Sprite made by plain script. */
  readonly _ctx: ConstructionContext | null;
  /** False until frame 1 has been built or rendered; later renders announce `added` / `removed`. */
  _rendered = false;
  /** Children created from the timeline, by depth. Children added by script are not in here. */
  readonly _timelineChildren = new Map<number, TimelineChild>();

  constructor() {
    super();
    // Read once, at construction (the active context is consumed). With none active, the Player's hooks may find
    // the symbol of `new.target` or of its nearest registered ancestor (D39); otherwise this is an empty Sprite.
    this._ctx = takeConstructionContext(new.target);
    const ctx = this._ctx;
    // Default_Instance_Name (Requirement 28.2, D35): taken before the Construction_Bind creates the children, so the
    // numbering is depth-first. The root consumes a number and the Player then names it root1; a named placement takes
    // none. A script-created object (no context) takes the next number too (Requirement 28.3, NOT VERIFIED).
    if (ctx === null || ctx.rootParent || !ctx.named) {
      const name = defaultInstanceName(takeInstanceNumber());
      if (!ctx?.rootParent) this.name = name;
    }
    if (ctx !== null) {
      ctx.instance = this;
      // The root is built with the Stage_Object as parent, so `stage` works inside its constructor.
      if (ctx.rootParent) this._parent = ctx.rootParent;
      // Registers the node, sets the root state and calls `_buildFrameOne`.
      ctx.hooks.constructFrameOne(this);
    }
  }

  /** Creates, attaches and binds the children of frame 1, silently. Called once, by the `constructFrameOne` hook. */
  _buildFrameOne(): void {
    const ctx = this._ctx;
    if (ctx === null) return;
    this._rendered = true;
    for (const entry of ctx.symbol.frames[0] ?? []) this._addTimelineChild(entry, false);
  }

  // ---- internal API (called through shim/internal.ts) ----

  /** Moves a clip one frame on. A Sprite has one frame and never advances. Returns whether the frame changed. */
  _advance(): boolean {
    return false;
  }

  /** Phase C: creates and announces children whose addition a backward move deferred. A Sprite has none. */
  _flushAdds(): void {}

  /** Queues this clip's frame script for the current frame. A Sprite has no frame scripts: queues nothing. */
  _enqueueFrameScript(): ClipScripts | null {
    return null;
  }

  /**
   * One tick over this clip and the clips below it, in the phases of design section 8 (G5):
   * A advance (children first), B enterFrame (children first), C frameConstructed (children first),
   * D frame scripts (root first, only clips whose frame changed). exitFrame (E) is a separate
   * children-first pass run by the Player (internal.exitFrame).
   * The clips are a snapshot taken before the tick, so clips created during it are not stepped. Sprites take part in
   * B, C and E like MovieClips (Flash dispatches these events on every display object); only MovieClips advance and
   * run frame scripts.
   * Backward moves remove in A and add (`added`) in C, before `frameConstructed`.
   */
  _step(): void {
    const pre = clipsPreOrder(this);
    const post = clipsPostOrder(this);
    const alive = (c: Sprite): boolean => isAttachedTo(c, this);
    const changed = new Set<Sprite>();

    // A. advance, children first (a child's `removed` bubbles while the parent is still on its old frame)
    for (const clip of post) if (alive(clip) && clip._advance()) changed.add(clip);
    // B. enterFrame, children first
    for (const clip of post) if (alive(clip)) clip.dispatchEvent(new Event(Event.ENTER_FRAME));
    // C. added for children created by backward moves, then frameConstructed, children first
    for (const clip of post) if (alive(clip)) clip._flushAdds();
    for (const clip of post) if (alive(clip)) clip.dispatchEvent(new Event(Event.FRAME_CONSTRUCTED));
    // D. frame scripts, root first
    let queuedOn: ClipScripts | null = null;
    for (const clip of pre) {
      if (!changed.has(clip) || !alive(clip)) continue;
      queuedOn = clip._enqueueFrameScript() ?? queuedOn;
    }
    queuedOn?.drain();
  }

  /** Dispatches EXIT_FRAME to this clip only. The runtime walks the tree (see internal.exitFrame). */
  _exitFrame(): void {
    this.dispatchEvent(new Event(Event.EXIT_FRAME));
  }

  /** Position that keeps timeline children in ascending depth order. */
  _indexForDepth(depth: number): number {
    let index = 0;
    for (let i = 0; i < this._children.length; i++) {
      const tl = this._timelineChildren.get(this._depthOf(this._children[i]!) ?? -1);
      if (tl !== undefined && tl.entry.depth < depth) index = i + 1;
    }
    return index;
  }

  _depthOf(child: DisplayObject): number | undefined {
    for (const [depth, tl] of this._timelineChildren) if (tl.child === child) return depth;
    return undefined;
  }

  _removeTimelineChild(depth: number, tl: TimelineChild, events: boolean): void {
    this._timelineChildren.delete(depth);
    this._unexpose(tl.entry.name, tl.child);
    if (events) announceRemoved(tl.child);
    if (detachChild(this, tl.child)) this._ctx?.hooks.childDetached(this, tl.child);
  }

  _addTimelineChild(entry: DisplayListEntry, events: boolean): void {
    const ctx = this._ctx;
    if (ctx === null) return;
    const child = ctx.hooks.createChild(entry);
    ctx.hooks.applyMatrix(child, entry.matrix);
    ctx.hooks.applyColorTransform(child, entry.colorTransform);
    const index = this._indexForDepth(entry.depth);
    attachChild(this, child, index);
    this._timelineChildren.set(entry.depth, { child, entry });
    ctx.hooks.childAttached(this, child, index);
    this._expose(entry.name, child, true);
    if (events) announceAdded(child);
  }

  _expose(name: string, child: DisplayObject, keepDefault = false): void {
    // An unnamed placement keeps its Default_Instance_Name (Requirement 28.2); a rename to '' clears the name.
    if (name !== '' || !keepDefault) child.name = name;
    if (name === '') return;
    try {
      Reflect.set(this, name, child);
    } catch {
      // A property that cannot be set stays unset.
    }
  }

  _unexpose(name: string, child: DisplayObject): void {
    if (name === '') return;
    try {
      if (Reflect.get(this, name) === child) Reflect.deleteProperty(this, name);
    } catch {
      // Nothing to remove.
    }
  }
}

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

registerClassName(DisplayObjectContainer, 'DisplayObjectContainer');
registerClassName(Sprite, 'Sprite');
