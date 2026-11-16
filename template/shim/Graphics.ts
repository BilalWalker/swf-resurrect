import { namedLimit } from './errorSink';

/** The winding names of `flash.display.GraphicsPathWinding`. */
export const GraphicsPathWinding = { NON_ZERO: 'nonZero', EVEN_ODD: 'evenOdd' } as const;

/** One recorded call. The runtime's graphics plan turns a list of these into draw operations. */
export type GfxPrim =
  | { k: 'lineStyle'; width: number; color: number }
  | { k: 'lineOff' }
  | { k: 'beginFill'; color: number }
  | { k: 'endFill' }
  | { k: 'circle'; x: number; y: number; r: number }
  | { k: 'moveTo'; x: number; y: number }
  | { k: 'lineTo'; x: number; y: number };

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * `Sprite.graphics` and `Shape.graphics` (as3-coverage task 15.1, Requirement 14). It only records primitives and
 * draws nothing; the Player pushes them to the backend when `version` changes. `drawPath` is expanded here.
 */
export class Graphics {
  /** The recorded primitives, in call order. Read by the runtime; not part of the AS3 surface. */
  _prims: GfxPrim[] = [];
  /** Increments on every call, so the runtime can tell whether the content changed. */
  version = 0;
  /** A fill is open, and it already has a segment or circle (a further subpath makes Named_Limit `fill-multiple-subpaths`). */
  private _fillOpen = false;
  private _fillHasShape = false;

  lineStyle(thickness?: number, color = 0, ..._ignored: unknown[]): void {
    // Flash reads alpha, pixelHinting, scaleMode, caps, joints and miterLimit too (Requirement 14.12).
    if (arguments.length > 2) namedLimit('lineStyle-args', 'lineStyle: arguments after color are ignored');
    if (thickness === undefined || Number.isNaN(thickness)) this._prims.push({ k: 'lineOff' });
    else this._prims.push({ k: 'lineStyle', width: Math.min(255, Math.max(0, thickness)), color: num(color) });
    this.version++;
  }

  beginFill(color = 0, alpha = 1): void {
    // The alpha is accepted and not drawn (Requirement 14.12).
    if (alpha !== 1) namedLimit('beginFill-alpha', 'beginFill: an alpha other than 1 is not drawn');
    this._fillOpen = true;
    this._fillHasShape = false;
    this._prims.push({ k: 'beginFill', color: num(color) });
    this.version++;
  }

  endFill(): void {
    this._fillOpen = false;
    this._fillHasShape = false;
    this._prims.push({ k: 'endFill' });
    this.version++;
  }

  drawCircle(x: number, y: number, radius: number): void {
    this._noteSubpath(true);
    this._prims.push({ k: 'circle', x: num(x), y: num(y), r: Math.abs(num(radius)) });
    this.version++;
  }

  moveTo(x: number, y: number): void {
    this._noteSubpath(false);
    this._prims.push({ k: 'moveTo', x: num(x), y: num(y) });
    this.version++;
  }

  lineTo(x: number, y: number): void {
    if (this._fillOpen) this._fillHasShape = true;
    this._prims.push({ k: 'lineTo', x: num(x), y: num(y) });
    this.version++;
  }

  /** A moveTo or circle inside a fill that already has a shape starts another subpath: drawn separately, no hole cut. */
  private _noteSubpath(isShape: boolean): void {
    if (!this._fillOpen) return;
    if (this._fillHasShape) namedLimit('fill-multiple-subpaths', 'a fill with more than one subpath is drawn as separate shapes; no hole is cut');
    if (isShape) this._fillHasShape = true;
  }

  /**
   * Command 1 is moveTo and command 2 is lineTo, two data values each. Any other command skips its data (it is
   * not skipped by one value, so a later command keeps its own pair) and records the Named_Limit once. The winding
   * is accepted and not used.
   */
  drawPath(commands: ArrayLike<number>, data: ArrayLike<number>, _winding: string = GraphicsPathWinding.EVEN_ODD): void {
    let at = 0;
    for (let i = 0; i < commands.length; i++) {
      const c = commands[i];
      if (c === 1) this.moveTo(data[at] as number, data[at + 1] as number);
      else if (c === 2) this.lineTo(data[at] as number, data[at + 1] as number);
      else namedLimit('drawPath-command', `drawPath: command ${String(c)} is not drawn and its data is skipped`);
      at += 2;
    }
    this.version++;
  }

  clear(): void {
    this._fillOpen = false;
    this._fillHasShape = false;
    this._prims = [];
    this.version++;
  }
}
