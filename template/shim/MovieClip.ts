import type { DisplayListEntry } from '../runtime/scene';
import type { DisplayObject } from './DisplayObject';
import { Event } from './events';
import {
  attachChild,
  clipsPostOrder,
  clipsPreOrder,
  detachChild,
  isAttachedTo,
  takeConstructionContext,
  type ConstructionContext,
} from './internal';
import { announceAdded, announceRemoved, Sprite } from './Sprite';

interface TimelineChild {
  child: DisplayObject;
  entry: DisplayListEntry;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class MovieClip extends Sprite {
  /** Frame scripts keyed by 1-based frame number (addFrameScript converts its 0-based index). */
  readonly frameScripts = new Map<number, () => void>();

  private readonly ctx: ConstructionContext | null;
  private frame = 1;
  private isPlaying = true;
  /** False until the first `_renderFrame`, which is silent. */
  private rendered = false;
  /** Entries of a backward move whose creation waits for phase C. */
  private pendingAdds: DisplayListEntry[] = [];
  /** Children created from the timeline, by depth. Children added by script are not in here. */
  private readonly timelineChildren = new Map<number, TimelineChild>();

  constructor() {
    super();
    // Read once, at construction (the active context is consumed). With none active, the Player's hooks may find
    // the symbol of `new.target` or of its nearest registered ancestor (D39); otherwise this is a one-frame empty clip.
    this.ctx = takeConstructionContext(new.target);
    if (this.ctx !== null) {
      this.ctx.instance = this;
      // The root is built with the Stage_Object as parent, so `stage` works inside its constructor.
      if (this.ctx.rootParent) this._parent = this.ctx.rootParent;
      // Registers the node, sets the root state and builds frame 1: named children are bound before any derived code.
      this.ctx.hooks.constructFrameOne(this);
    }  }

  play(): void {
    this.isPlaying = true;
  }

  stop(): void {
    this.isPlaying = false;
  }

  gotoAndPlay(frame: number | string): void {
    if (this.goto(frame)) this.isPlaying = true;
  }

  gotoAndStop(frame: number | string): void {
    if (this.goto(frame)) this.isPlaying = false;
  }

  get currentFrame(): number {
    return this.frame;
  }

  get totalFrames(): number {
    return Math.max(1, this.ctx?.symbol.frameCount ?? 1);
  }

  get currentLabels(): ReadonlyArray<{ name: string; frame: number }> {
    return (this.ctx?.symbol.labels ?? []).map((l) => ({ name: l.name, frame: l.frame }));
  }

  /** Pairs of (0-based frame index, function). An invalid pair warns and is ignored. */
  addFrameScript(...pairs: Array<number | (() => void)>): void {
    if (pairs.length % 2 !== 0) {
      console.warn(`addFrameScript: odd number of arguments (${pairs.length}); the last value is ignored`);
    }
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      const index = pairs[i];
      const fn = pairs[i + 1];
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= this.totalFrames) {
        console.warn(`addFrameScript: frame index out of range: ${String(index)}`);
        continue;
      }
      if (typeof fn !== 'function') {
        console.warn(`addFrameScript: not a function for index ${index}`);
        continue;
      }
      this.frameScripts.set(index + 1, fn);
    }
  }

  // ---- internal API (called through shim/internal.ts) ----

  /** True while the clip advances on each tick. */
  get _playing(): boolean {
    return this.isPlaying;
  }

  /**
   * Reconciles the children with the current frame's display list.
   *
   * Events (design section 8, G6 timeline part). The first render of a clip is silent (the Player
   * announces the initial build itself). Later renders:
   * - Backward move (wrap or goto to an earlier frame): every non-retained child is removed with
   *   `removed` (+ `removedFromStage`) now; the replacements are created and announced with `added`
   *   (+ `addedToStage`) now, or, with `deferAdds`, in phase C through `_flushAdds()`. Observed.
   * - Forward same-depth, different-symbol replacement: silent and atomic. Observed.
   * - Forward removal with no replacement, and forward addition at a new depth: `removed` / `added`
   *   as Flash does for RemoveObject / PlaceObject. Inferred, not exercised by the sample.
   * Retained means same depth and same symbol.
   */
  _renderFrame(backward = false, deferAdds = false): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const announce = this.rendered;
    this.rendered = true;
    this.pendingAdds = [];
    const entries: readonly DisplayListEntry[] = ctx.symbol.frames[this.frame - 1] ?? [];
    const wanted = new Set<number>();
    for (const e of entries) wanted.add(e.depth);

    for (const [depth, tl] of [...this.timelineChildren]) {
      if (!wanted.has(depth)) this.removeTimelineChild(depth, tl, announce);
    }

    for (const entry of entries) {
      const old = this.timelineChildren.get(entry.depth);
      if (old !== undefined && old.entry.symbolId === entry.symbolId) {
        const prev = old.entry;
        if (!sameNumbers(prev.matrix, entry.matrix)) ctx.hooks.applyMatrix(old.child, entry.matrix);
        if (!sameNumbers(prev.colorTransform, entry.colorTransform)) {
          ctx.hooks.applyColorTransform(old.child, entry.colorTransform);
        }
        if (prev.name !== entry.name) {
          this.unexpose(prev.name, old.child);
          this.expose(entry.name, old.child);
        }
        old.entry = entry;
        continue;
      }
      if (old !== undefined) this.removeTimelineChild(entry.depth, old, announce && backward);
      // Silent only for a forward replacement at the same depth.
      const events = announce && (backward || old === undefined);
      if (backward && deferAdds && announce) {
        this.pendingAdds.push(entry);
        continue;
      }
      this.addTimelineChild(entry, events);
    }
  }

  /** Phase C: creates and announces the children whose addition `_renderFrame(.., true)` deferred. */
  _flushAdds(): void {
    const pending = this.pendingAdds;
    this.pendingAdds = [];
    for (const entry of pending) {
      if (this.timelineChildren.has(entry.depth)) continue;
      this.addTimelineChild(entry, true);
    }
  }
  /**
   * One tick over this clip and the clips below it, in the phases of design section 8 (G5):
   * A advance (children first), B enterFrame (children first), C frameConstructed (children first),
   * D frame scripts (root first, only clips whose frame changed). exitFrame (E) is a separate
   * children-first pass run by the Player (internal.exitFrame).
   * The clips are a snapshot taken before the tick, so clips created during it are not stepped.
   * Backward moves remove in A and add (`added`) in C, before `frameConstructed`.
   */
  _step(): void {
    const pre = clipsPreOrder(this);
    const post = clipsPostOrder(this);
    const alive = (c: MovieClip): boolean => isAttachedTo(c, this);
    const changed = new Set<MovieClip>();

    // A. advance, children first (a child's `removed` bubbles while the parent is still on its old frame)
    for (const clip of post) {
      if (!alive(clip)) continue;
      if (clip.isPlaying && clip.totalFrames > 1) {
        const previous = clip.frame;
        clip.frame = clip.frame >= clip.totalFrames ? 1 : clip.frame + 1;
        clip._renderFrame(clip.frame < previous, true);
        changed.add(clip);
      }
    }
    // B. enterFrame, children first
    for (const clip of post) if (alive(clip)) clip.dispatchEvent(new Event(Event.ENTER_FRAME));
    // C. added for children created by backward moves, then frameConstructed, children first
    for (const clip of post) if (alive(clip)) clip._flushAdds();
    for (const clip of post) if (alive(clip)) clip.dispatchEvent(new Event(Event.FRAME_CONSTRUCTED));
    // D. frame scripts, root first
    let queuedFor: ConstructionContext | null = null;
    for (const clip of pre) {
      if (!changed.has(clip) || !alive(clip) || clip.ctx === null) continue;
      clip.ctx.scripts.enqueue(clip, clip.frame);
      queuedFor = clip.ctx;
    }
    queuedFor?.scripts.drain();
  }

  /** Dispatches EXIT_FRAME to this clip only. The runtime walks the tree (see internal.exitFrame). */
  _exitFrame(): void {
    this.dispatchEvent(new Event(Event.EXIT_FRAME));
  }

  // ---- private ----

  /** Validates, moves to the frame and renders. Returns false (state unchanged, one warning) if invalid. */
  private goto(frame: number | string): boolean {
    const target = this.resolveFrame(frame);
    if (target === null) {
      console.warn(`MovieClip: invalid frame or label: ${String(frame)}`);
      return false;
    }
    const previous = this.frame;
    this.frame = target;
    this._renderFrame(target < previous);
    const ctx = this.ctx;
    if (ctx === null) return true;
    const cycle = ctx.cycle;
    if (cycle === undefined || cycle.busy) {
      ctx.scripts.enqueue(this, target);
      ctx.scripts.drain();
    } else {
      // Goto_Extra_Cycle (design G7): the script runs inside the cycle, after frameConstructed.
      if (target !== previous) ctx.scripts.enqueue(this, target);
      cycle.runGotoCycle();
    }
    return true;
  }

  private resolveFrame(frame: number | string): number | null {
    if (typeof frame === 'string') {
      return this.ctx?.symbol.labels.find((l) => l.name === frame)?.frame ?? null;
    }
    if (typeof frame === 'number' && Number.isInteger(frame) && frame >= 1 && frame <= this.totalFrames) {
      return frame;
    }
    return null;
  }

  /** Position that keeps timeline children in ascending depth order. */
  private indexForDepth(depth: number): number {
    let index = 0;
    for (let i = 0; i < this._children.length; i++) {
      const tl = this.timelineChildren.get(this.depthOf(this._children[i]!) ?? -1);
      if (tl !== undefined && tl.entry.depth < depth) index = i + 1;
    }
    return index;
  }

  private depthOf(child: DisplayObject): number | undefined {
    for (const [depth, tl] of this.timelineChildren) if (tl.child === child) return depth;
    return undefined;
  }

  private removeTimelineChild(depth: number, tl: TimelineChild, events: boolean): void {
    this.timelineChildren.delete(depth);
    this.unexpose(tl.entry.name, tl.child);
    if (events) announceRemoved(tl.child);
    if (detachChild(this, tl.child)) this.ctx?.hooks.childDetached(this, tl.child);
  }

  private addTimelineChild(entry: DisplayListEntry, events: boolean): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const child = ctx.hooks.createChild(entry);
    ctx.hooks.applyMatrix(child, entry.matrix);
    ctx.hooks.applyColorTransform(child, entry.colorTransform);
    const index = this.indexForDepth(entry.depth);
    attachChild(this, child, index);
    this.timelineChildren.set(entry.depth, { child, entry });
    ctx.hooks.childAttached(this, child, index);
    this.expose(entry.name, child);
    if (events) announceAdded(child);
  }

  private expose(name: string, child: DisplayObject): void {
    child.name = name;
    if (name === '') return;
    try {
      Reflect.set(this, name, child);
    } catch {
      // A property that cannot be set stays unset.
    }
  }

  private unexpose(name: string, child: DisplayObject): void {
    if (name === '') return;
    try {
      if (Reflect.get(this, name) === child) Reflect.deleteProperty(this, name);
    } catch {
      // Nothing to remove.
    }
  }
}
