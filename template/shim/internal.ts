// Internal API used by the runtime. Not re-exported from index.ts; translated code never sees it.
import type { DisplayListEntry, SpriteSymbol } from '../runtime/scene';
import type { DisplayObject } from './DisplayObject';
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

export interface ConstructionContext {
  symbol: SpriteSymbol;
  symbolId: number;
  scripts: ClipScripts;
  hooks: ClipHooks;
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
  parent.removeChild(child);
  return true;
}

/** Renders the clip's current frame into its children. */
export function renderFrame(mc: MovieClip): void {
  mc._renderFrame();
}

/**
 * EXIT_FRAME pass: snapshots every MovieClip under `root` (pre-order, root included), then
 * dispatches EXIT_FRAME once to each one that is still attached to `root`.
 */
export function exitFrame(root: MovieClip): void {
  const clips: MovieClip[] = [];
  const collect = (o: DisplayObject): void => {
    if (typeof (o as Partial<MovieClip>)._exitFrame !== 'function') return;
    clips.push(o as MovieClip);
    for (const c of (o as MovieClip)._children) collect(c);
  };
  collect(root);
  const attached = (o: DisplayObject): boolean => {
    for (let p: DisplayObject | null = o; p !== null; p = p._parent) if (p === root) return true;
    return false;
  };
  for (const clip of clips) if (attached(clip)) clip._exitFrame();
}

/** Advances one tick for `mc` and every clip below it. */
export function step(mc: MovieClip): void {
  mc._step();
}
