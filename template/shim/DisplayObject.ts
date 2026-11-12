import { EventDispatcher, type Event } from './events';
import { getPointerPosition, globalToLocal } from './internal';
import type { DisplayObjectContainer } from './Sprite';
import { isStage, type ParentNode, type Stage } from './Stage';

export class DisplayObject extends EventDispatcher {
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  /** Degrees. */
  rotation = 0;
  visible = true;
  name = '';

  /** Unscaled content size, set by the runtime from backend bounds. Not part of the AS3 surface. */
  _intrinsicWidth = 0;
  _intrinsicHeight = 0;
  /** Maintained by DisplayObjectContainer only. */
  _parent: ParentNode | null = null;

  /** Set by the Player on the root clip only. A clip is on the stage when its parent chain ends at such a root. */
  _isStageRoot = false;
  private _alpha = 1;

  get alpha(): number {
    return this._alpha;
  }
  set alpha(v: number) {
    // NaN has no sensible clamp; keep the previous value.
    if (Number.isNaN(v)) return;
    this._alpha = Math.min(1, Math.max(0, v));
  }

  get width(): number {
    return this._intrinsicWidth * Math.abs(this.scaleX);
  }
  set width(v: number) {
    if (this._intrinsicWidth > 0 && Number.isFinite(v)) this.scaleX = v / this._intrinsicWidth;
  }

  get height(): number {
    return this._intrinsicHeight * Math.abs(this.scaleY);
  }
  set height(v: number) {
    if (this._intrinsicHeight > 0 && Number.isFinite(v)) this.scaleY = v / this._intrinsicHeight;
  }

  /**
   * Delivers at the target (eventPhase 2) and, when the event bubbles, to each ancestor in turn
   * (eventPhase 3, currentTarget set). The target stays this object. The ancestor chain is
   * taken before delivery starts, so listeners that re-parent objects do not change it.
   */
  override dispatchEvent(e: Event): void {
    e.target = this;
    e.eventPhase = 2;
    e.currentTarget = this;
    const ancestors: ParentNode[] = [];
    if (e.bubbles) for (let p = this._parent; p !== null; p = p._parent) ancestors.push(p);
    this._deliver(e);
    for (const p of ancestors) {
      e.eventPhase = 3;
      e.currentTarget = p;
      p._deliver(e);
    }
  }
  /** True when the parent chain (this object included) ends at a root marked by the Player. */
  _onStage(): boolean {
    for (let p: DisplayObject | ParentNode | null = this; p !== null; p = p._parent) {
      if (!isStage(p) && p._isStageRoot) return true;
    }
    return false;
  }
  /** Pointer x in this object's coordinate space; 0 when a scale on the parent chain is 0. */
  get mouseX(): number {
    const p = getPointerPosition();
    return globalToLocal(this, p.x, p.y).x;
  }
  /** Pointer y in this object's coordinate space; 0 when a scale on the parent chain is 0. */
  get mouseY(): number {
    const p = getPointerPosition();
    return globalToLocal(this, p.x, p.y).y;
  }
  /** The Stage_Object when this object is on the stage (itself excluded unless it is the Stage), else null. */
  get stage(): Stage | null {
    for (let p: DisplayObject | ParentNode | null = this; p !== null; p = p._parent) if (isStage(p)) return p;
    return null;
  }
  get parent(): ParentNode | null {
    return this._parent;
  }
}
