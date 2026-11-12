// Internal API used by the runtime. Not re-exported from index.ts; translated code never sees it.
import type { DisplayListEntry, SpriteSymbol } from '../runtime/scene';
import type { DisplayObject } from './DisplayObject';
import { Event } from './events';
import type { MovieClip } from './MovieClip';
import type { DisplayObjectContainer } from './Sprite';

/** What a clip needs from the runtime to build and update its timeline children. */
export interface ClipHooks {
  /** Creates the display object (and backend node) for an entry. Does not attach it. */
  createChild(entry: DisplayListEntry): DisplayObject;
  /** Called after a child has been inserted at `index` in the parent's child list. */
  childAttached(parent: DisplayObjectContainer, child: DisplayObject, index: number): void;
  /** Called after a child has been removed from the parent; the runtime destroys its node. */
  childDetached(parent: DisplayObjectContainer, child: DisplayObject): void;
  applyMatrix(child: DisplayObject, matrix: DisplayListEntry['matrix']): void;
  applyColorTransform(child: DisplayObject, ct: DisplayListEntry['colorTransform']): void;
}

/** Frame-script queue, as seen by a clip. ScriptQueue satisfies it. */
export interface ClipScripts {
  enqueue(host: MovieClip, frame: number): void;
  drain(): void;
}

/**
 * Goto_Extra_Cycle support (design section 8, G7). Supplied by the Player only; clips built
 * without a Player have no cycle and keep the plain goto behaviour.
 */
export interface ClipCycle {
  /** True while a frame step, the initial build or another cycle is on the call stack. */
  readonly busy: boolean;
  /** frameConstructed, queued frame scripts, exitFrame over the whole stage tree. */
  runGotoCycle(): void;
}

export interface ConstructionContext {
  symbol: SpriteSymbol;
  symbolId: number;
  scripts: ClipScripts;
  hooks: ClipHooks;
  cycle?: ClipCycle;
}

let current: ConstructionContext | null = null;

/** The context a MovieClip constructor running right now should read, or null. */
export function currentConstructionContext(): ConstructionContext | null {
  return current;
}

/** Runs `fn` with `ctx` visible to MovieClip constructors. Restores the previous context on exit. */
export function withConstructionContext<T>(ctx: ConstructionContext, fn: () => T): T {
  const previous = current;
  current = ctx;
  try {
    return fn();
  } finally {
    current = previous;
  }
}

/** Inserts `child` at `index` (clamped) in `parent`'s child list, detaching it from any other parent first. */
export function attachChild(parent: DisplayObjectContainer, child: DisplayObject, index?: number): void {
  for (let p: DisplayObject | null = parent; p !== null; p = p._parent) {
    if (p === child) throw new Error('attachChild: a display object cannot contain itself or an ancestor');
  }
  child._parent?.removeChild(child);
  const i = index === undefined ? parent._children.length : Math.max(0, Math.min(index, parent._children.length));
  parent._children.splice(i, 0, child);
  child._parent = parent;
}

/** Removes `child` from `parent` if it is still a child. Returns whether it was removed. */
export function detachChild(parent: DisplayObjectContainer, child: DisplayObject): boolean {
  if (child._parent !== parent) return false;
  // No events here: the timeline decides when `removed` fires (design section 8, G6).
  const i = parent._children.indexOf(child);
  if (i >= 0) parent._children.splice(i, 1);
  child._parent = null;
  return true;
}

let pointerX = 0;
let pointerY = 0;

/** Publishes the pointer position, in stage coordinates, for `mouseX` / `mouseY`. Called by the Player. */
export function setPointerPosition(x: number, y: number): void {
  pointerX = x;
  pointerY = y;
}

/** The last published pointer position in stage coordinates; (0, 0) before the first call. */
export function getPointerPosition(): { x: number; y: number } {
  return { x: pointerX, y: pointerY };
}

/**
 * Maps a stage point into the local space of `obj` through its parent chain (the inverse of
 * p' = T + R * S * local at each level, topmost ancestor first). Returns (0, 0) when any scale on the
 * chain is 0, since the mapping has no inverse.
 */
export function globalToLocal(obj: DisplayObject, x: number, y: number): { x: number; y: number } {
  const chain: DisplayObject[] = [];
  for (let p: DisplayObject | null = obj; p !== null; p = p._parent) chain.push(p);
  let px = x;
  let py = y;
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i]!;
    if (n.scaleX === 0 || n.scaleY === 0) return { x: 0, y: 0 };
    const rad = (n.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = px - n.x;
    const dy = py - n.y;
    px = (cos * dx + sin * dy) / n.scaleX;
    py = (-sin * dx + cos * dy) / n.scaleY;
  }
  return { x: px, y: py };
}

/** Renders the clip's current frame into its children. */
export function renderFrame(mc: MovieClip): void {
  mc._renderFrame();
}

function isClipLike(o: DisplayObject): boolean {
  return typeof (o as Partial<MovieClip>)._exitFrame === 'function';
}

/** Snapshot of every MovieClip under `root` (root included), parents before children, display order. */
export function clipsPreOrder(root: MovieClip): MovieClip[] {
  const out: MovieClip[] = [];
  const walk = (o: DisplayObject): void => {
    if (!isClipLike(o)) return;
    out.push(o as MovieClip);
    for (const c of [...(o as MovieClip)._children]) walk(c);
  };
  walk(root);
  return out;
}

/** Snapshot of every MovieClip under `root` (root included), children first in display order, root last. */
export function clipsPostOrder(root: MovieClip): MovieClip[] {
  const out: MovieClip[] = [];
  const walk = (o: DisplayObject): void => {
    if (!isClipLike(o)) return;
    for (const c of [...(o as MovieClip)._children]) walk(c);
    out.push(o as MovieClip);
  };
  walk(root);
  return out;
}

/** True when `o` is `root` or still a descendant of it. */
export function isAttachedTo(o: DisplayObject, root: DisplayObject): boolean {
  for (let p: DisplayObject | null = o; p !== null; p = p._parent) if (p === root) return true;
  return false;
}

/**
 * EXIT_FRAME pass: snapshots every MovieClip under `root`, children first (post-order, root last),
 * then dispatches EXIT_FRAME once to each one that is still attached to `root`.
 * User decision (a), verify task 12.1: children-first, because reference/output.txt lines 13-15 and
 * 29-31 show the children's exitFrame before the root's (Requirement 8.9).
 */
export function exitFrame(root: MovieClip): void {
  for (const clip of clipsPostOrder(root)) if (isAttachedTo(clip, root)) clip._exitFrame();
}

/**
 * FRAME_CONSTRUCTED pass: snapshots every MovieClip under `root`, children first, then dispatches
 * the event once to each one that is still attached to `root` (Goto_Extra_Cycle, design G7).
 */
export function frameConstructed(root: MovieClip): void {
  for (const clip of clipsPostOrder(root)) {
    if (isAttachedTo(clip, root)) clip.dispatchEvent(new Event(Event.FRAME_CONSTRUCTED));
  }
}

/** Advances one tick for `mc` and every clip below it. */
export function step(mc: MovieClip): void {
  mc._step();
}
