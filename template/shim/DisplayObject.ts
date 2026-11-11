import { EventDispatcher } from './events';
import type { DisplayObjectContainer } from './Sprite';

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
  _parent: DisplayObjectContainer | null = null;

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

  get parent(): DisplayObjectContainer | null {
    return this._parent;
  }
}
