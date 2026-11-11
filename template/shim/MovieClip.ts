import type { DisplayListEntry } from '../runtime/scene';
import type { DisplayObject } from './DisplayObject';
import { Event } from './events';
import {
  attachChild,
  currentConstructionContext,
  detachChild,
  type ConstructionContext,
} from './internal';
import { Sprite } from './Sprite';

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
  /** Children created from the timeline, by depth. Children added by script are not in here. */
  private readonly timelineChildren = new Map<number, TimelineChild>();

  constructor() {
    super();
    // Read once, at construction. Outside a context this is a one-frame empty clip.
    this.ctx = currentConstructionContext();
  }

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

  /** Reconciles the children with the current frame's display list. */
  _renderFrame(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const entries: readonly DisplayListEntry[] = ctx.symbol.frames[this.frame - 1] ?? [];
    const wanted = new Set<number>();
    for (const e of entries) wanted.add(e.depth);

    for (const [depth, tl] of [...this.timelineChildren]) {
      if (!wanted.has(depth)) this.removeTimelineChild(depth, tl);
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
      if (old !== undefined) this.removeTimelineChild(entry.depth, old);
      const child = ctx.hooks.createChild(entry);
      ctx.hooks.applyMatrix(child, entry.matrix);
      ctx.hooks.applyColorTransform(child, entry.colorTransform);
      const index = this.indexForDepth(entry.depth);
      attachChild(this, child, index);
      this.timelineChildren.set(entry.depth, { child, entry });
      ctx.hooks.childAttached(this, child, index);
      this.expose(entry.name, child);
    }
  }

  /** One tick: advance, render, ENTER_FRAME, frame script, then the children that existed before. */
  _step(): void {
    const before = this._children.filter(isClip);
    let entered = false;
    if (this.isPlaying && this.totalFrames > 1) {
      this.frame = this.frame >= this.totalFrames ? 1 : this.frame + 1;
      this._renderFrame();
      entered = true;
    }
    const e = new Event(Event.ENTER_FRAME);
    this.dispatchEvent(e);
    if (entered && this.ctx !== null) {
      this.ctx.scripts.enqueue(this, this.frame);
      this.ctx.scripts.drain();
    }
    for (const child of before) {
      if (child._parent === this) child._step();
    }
  }

  // ---- private ----

  /** Validates, moves to the frame and renders. Returns false (state unchanged, one warning) if invalid. */
  private goto(frame: number | string): boolean {
    const target = this.resolveFrame(frame);
    if (target === null) {
      console.warn(`MovieClip: invalid frame or label: ${String(frame)}`);
      return false;
    }
    this.frame = target;
    this._renderFrame();
    if (this.ctx !== null) {
      this.ctx.scripts.enqueue(this, target);
      this.ctx.scripts.drain();
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

  private removeTimelineChild(depth: number, tl: TimelineChild): void {
    this.timelineChildren.delete(depth);
    this.unexpose(tl.entry.name, tl.child);
    if (detachChild(this, tl.child)) this.ctx?.hooks.childDetached(this, tl.child);
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

function isClip(o: DisplayObject): o is MovieClip {
  return typeof (o as Partial<MovieClip>)._step === 'function';
}
