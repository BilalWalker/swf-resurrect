import type { DisplayListEntry } from '../runtime/scene';
import type { DisplayObject } from './DisplayObject';
import { registerClassName, type ClipScripts } from './internal';
import { Sprite } from './Sprite';

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class MovieClip extends Sprite {
  /** Frame scripts keyed by 1-based frame number (addFrameScript converts its 0-based index). */
  readonly frameScripts = new Map<number, () => void>();

  private frame = 1;
  private isPlaying = true;
  /** Entries of a backward move whose creation waits for phase C. */
  private pendingAdds: DisplayListEntry[] = [];

  // No constructor: the Sprite constructor consumes the ConstructionContext and builds frame 1 (_ctx, D24).

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
    return Math.max(1, this._ctx?.symbol.frameCount ?? 1);
  }

  get currentLabels(): ReadonlyArray<{ name: string; frame: number }> {
    return (this._ctx?.symbol.labels ?? []).map((l) => ({ name: l.name, frame: l.frame }));
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
    const ctx = this._ctx;
    if (ctx === null) return;
    const announce = this._rendered;
    this._rendered = true;
    this.pendingAdds = [];
    const entries: readonly DisplayListEntry[] = ctx.symbol.frames[this.frame - 1] ?? [];
    const wanted = new Set<number>();
    for (const e of entries) wanted.add(e.depth);

    for (const [depth, tl] of [...this._timelineChildren]) {
      if (!wanted.has(depth)) this._removeTimelineChild(depth, tl, announce);
    }

    for (const entry of entries) {
      const old = this._timelineChildren.get(entry.depth);
      if (old !== undefined && old.entry.symbolId === entry.symbolId) {
        const prev = old.entry;
        if (!sameNumbers(prev.matrix, entry.matrix)) ctx.hooks.applyMatrix(old.child, entry.matrix);
        if (!sameNumbers(prev.colorTransform, entry.colorTransform)) {
          ctx.hooks.applyColorTransform(old.child, entry.colorTransform);
        }
        if (prev.name !== entry.name) {
          this._unexpose(prev.name, old.child);
          this._expose(entry.name, old.child);
        }
        old.entry = entry;
        continue;
      }
      if (old !== undefined) this._removeTimelineChild(entry.depth, old, announce && backward);
      // Silent only for a forward replacement at the same depth.
      const events = announce && (backward || old === undefined);
      if (backward && deferAdds && announce) {
        this.pendingAdds.push(entry);
        continue;
      }
      this._addTimelineChild(entry, events);
    }
  }

  /** Phase C: creates and announces the children whose addition `_renderFrame(.., true)` deferred. */
  override _flushAdds(): void {
    const pending = this.pendingAdds;
    this.pendingAdds = [];
    for (const entry of pending) {
      if (this._timelineChildren.has(entry.depth)) continue;
      this._addTimelineChild(entry, true);
    }
  }
  /** Phase A: moves to the next frame (wrapping) when playing. Returns whether the frame changed. */
  override _advance(): boolean {
    if (!this.isPlaying || this.totalFrames <= 1) return false;
    const previous = this.frame;
    this.frame = this.frame >= this.totalFrames ? 1 : this.frame + 1;
    this._renderFrame(this.frame < previous, true);
    return true;
  }

  /** Internal: the owner text of a frame-script Error_Site: the class name, or `symbol <id>` for a plain clip. */
  _scriptOwner(): string {
    const name = this.constructor.name;
    if (name !== 'MovieClip') return name;
    return this._ctx === null ? name : `symbol ${this._ctx.symbolId}`;
  }

  /** Phase D: queues the script of the current frame. */
  override _enqueueFrameScript(): ClipScripts | null {
    const ctx = this._ctx;
    if (ctx === null) return null;
    ctx.scripts.enqueue(this, this.frame);
    return ctx.scripts;
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
    const ctx = this._ctx;
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
      return this._ctx?.symbol.labels.find((l) => l.name === frame)?.frame ?? null;
    }
    if (typeof frame === 'number' && Number.isInteger(frame) && frame >= 1 && frame <= this.totalFrames) {
      return frame;
    }
    return null;
  }
}

registerClassName(MovieClip, 'MovieClip');
