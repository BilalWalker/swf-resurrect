import { registerClassName } from './classNames';
import { namedLimit } from './errorSink';
import { defaultInstanceName, defaultNamesAreSuppressed, takeInstanceNumber } from './internal';
import { InteractiveObject } from './InteractiveObject';
import { measureText } from './textMeasure';

/**
 * A one-line text label (as3-coverage task 16, Requirements 15.1 to 15.4, 15.7). `width` and `height` are the text box
 * and never change `scaleX` or `scaleY`. `textWidth` is measured in the `text` setter, so it is valid at once.
 * Not provided: `htmlText`, `autoSize`, `defaultTextFormat`, `multiline` (a script that uses one gets a type error that
 * names the member in the Translation_Report).
 */
export class TextField extends InteractiveObject {
  /** Marker read by the Stage (it cannot import this file). */
  readonly _isTextField = true;
  selectable = true;
  private _text = '';
  private _textColor = 0x000000;
  private _textWidth = 0;
  constructor() {
    super();
    this._intrinsicWidth = 100;
    this._intrinsicHeight = 100;
    if (!defaultNamesAreSuppressed()) this.name = defaultInstanceName(takeInstanceNumber());
    namedLimit('device-font-metrics', 'TextField text is drawn in the browser; device-font metrics differ from Flash and textWidth is measured in the browser');
  }
  get text(): string {
    return this._text;
  }
  set text(v: string) {
    this._text = String(v);
    this._textWidth = measureText(this._text);
  }
  get textColor(): number {
    return this._textColor;
  }
  set textColor(v: number) {
    this._textColor = Number.isFinite(v) ? Math.trunc(v) & 0xffffff : 0;
  }
  /** Width of the text in pixels, without the 2 pixel gutter. */
  get textWidth(): number {
    return this._textWidth;
  }
  override get width(): number {
    return this._intrinsicWidth;
  }
  override set width(v: number) {
    if (Number.isFinite(v) && v >= 0) this._intrinsicWidth = v;
  }
  override get height(): number {
    return this._intrinsicHeight;
  }
  override set height(v: number) {
    if (Number.isFinite(v) && v >= 0) this._intrinsicHeight = v;
  }
}
registerClassName(TextField, 'TextField');
