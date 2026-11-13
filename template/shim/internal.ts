// Internal API used by the runtime. Not re-exported from index.ts; translated code never sees it.
import type { CaughtError, ErrorSink } from '../runtime/errorReport';
import type { DisplayListEntry, SpriteSymbol } from '../runtime/scene';
import type { DisplayObject } from './DisplayObject';
import { Event } from './events';
import type { MovieClip } from './MovieClip';
import type { DisplayObjectContainer, Sprite } from './Sprite';
import { isStage, type ParentNode, type Stage } from './Stage';

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
  /**
   * Called once by the Sprite constructor (which MovieClip inherits), as soon as the instance exists (Requirement 24,
   * D24): register the backend node, set the root state, then call buildFrameOne(sprite) so that the named children
   * are bound before any derived field initialiser or constructor statement runs.
   */
  constructFrameOne(sprite: Sprite): void;
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
  /** The Stage_Object, set by the Player for the root clip only; the Sprite constructor adopts it as its parent. */
  rootParent?: Stage;
  /** The placement had an instance name (Requirement 28.2): the clip then takes no Default_Instance_Name. */
  named: boolean;
  /** Set by the Sprite constructor as soon as the instance exists; read by the Player after a throw (21.3). */
  instance: Sprite | null;
}

/** Context for a MovieClip built by script (
ew Cls()), found from the constructor chain; null when none. */
export type ContextForConstructor = (newTarget: Function) => ConstructionContext | null;

let contextForConstructor: ContextForConstructor | null = null;

/** Installed by the Player when it is constructed (one movie per Player, D39); null removes it. */
export function setContextForConstructor(provider: ContextForConstructor | null): void {
  contextForConstructor = provider;
}

/**
 * The context a MovieClip constructor consumes: the active one (taken, so that a 
ew Cls() from script in a
 * constructor body does not see it), else the one the Player finds for 
ewTarget, else null.
 */
export function takeConstructionContext(newTarget: Function): ConstructionContext | null {
  const active = current;
  if (active !== null) {
    current = null;
    return active;
  }
  return contextForConstructor === null ? null : contextForConstructor(newTarget);
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
  for (let p: DisplayObject | ParentNode | null = parent; p !== null; p = p._parent) {
    if (p === child) throw new Error('attachChild: a display object cannot contain itself or an ancestor');
  }
  const old = child._parent;
  if (old !== null && 'removeChild' in old) old.removeChild(child);
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

const defaultErrorSink: ErrorSink = (e) => {
  console.error(`[SWF Resurrect] ${e.site}: ${e.message}`);
};
let errorSink: ErrorSink = defaultErrorSink;
/** Replaces the Caught_Error sink (Requirement 25.5); null restores the console.error default. */
export function setCaughtErrorSink(sink: ErrorSink | null): void {
  errorSink = sink ?? defaultErrorSink;
}
/** Reports one Caught_Error to the current sink. Used by the dispatcher and the script queue. */
export function reportCaughtError(e: CaughtError): void {
  errorSink(e);
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
  for (let p: DisplayObject | ParentNode | null = obj; p !== null && !isStage(p); p = p._parent) chain.push(p);
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

/**
 * Makes stage the parent of 
oot and its only child. Used by the Player and by tests; the root must not
 * already have another parent.
 */
export function attachRoot(stage: Stage, root: Sprite): void {
  root._parent = stage;
  stage._children = [root];
}

/** Builds the frame-1 children of sprite: what a constructFrameOne hook calls once the node is registered. */
export function buildFrameOne(sprite: Sprite): void {
  sprite._buildFrameOne();
}

/** Renders the clip's current frame into its children. */
export function renderFrame(mc: MovieClip): void {
  mc._renderFrame();
}

function isClipLike(o: DisplayObject): boolean {
  return typeof (o as Partial<Sprite>)._exitFrame === 'function';
}

/** Snapshot of every Sprite or MovieClip under `root` (root included), parents before children, display order. */
export function clipsPreOrder(root: Sprite): Sprite[] {
  const out: Sprite[] = [];
  const walk = (o: DisplayObject): void => {
    if (!isClipLike(o)) return;
    out.push(o as Sprite);
    for (const c of [...(o as Sprite)._children]) walk(c);
  };
  walk(root);
  return out;
}

/** Snapshot of every Sprite or MovieClip under `root` (root included), children first in display order, root last. */
export function clipsPostOrder(root: Sprite): Sprite[] {
  const out: Sprite[] = [];
  const walk = (o: DisplayObject): void => {
    if (!isClipLike(o)) return;
    for (const c of [...(o as Sprite)._children]) walk(c);
    out.push(o as Sprite);
  };
  walk(root);
  return out;
}

/** True when `o` is `root` or still a descendant of it. */
export function isAttachedTo(o: DisplayObject, root: DisplayObject): boolean {
  for (let p: DisplayObject | ParentNode | null = o; p !== null; p = p._parent) if (p === root) return true;
  return false;
}

/**
 * EXIT_FRAME pass: snapshots every MovieClip under `root`, children first (post-order, root last),
 * then dispatches EXIT_FRAME once to each one that is still attached to `root`.
 * User decision (a), verify task 12.1: children-first, because reference/output.txt lines 13-15 and
 * 29-31 show the children's exitFrame before the root's (Requirement 8.9).
 */
export function exitFrame(root: Sprite): void {
  for (const clip of clipsPostOrder(root)) if (isAttachedTo(clip, root)) clip._exitFrame();
}

/**
 * FRAME_CONSTRUCTED pass: snapshots every MovieClip under `root`, children first, then dispatches
 * the event once to each one that is still attached to `root` (Goto_Extra_Cycle, design G7).
 */
export function frameConstructed(root: Sprite): void {
  for (const clip of clipsPostOrder(root)) {
    if (isAttachedTo(clip, root)) clip.dispatchEvent(new Event(Event.FRAME_CONSTRUCTED));
  }
}

/** Advances one tick for `mc` and every clip below it. */
export function step(mc: Sprite): void {
  mc._step();
}
