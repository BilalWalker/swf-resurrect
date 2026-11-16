// The text measurement function of TextField (as3-coverage task 16, design "TextField and filters"). Its own module with
// no imports: the page installs a canvas `measureText` function, tests install a fixed width per character.
/** Width in pixels of `text` in the CSS font `font`. */
export type TextMeasure = (text: string, font: string) => number;
/** The default device font of a TextField: Times New Roman, 12 pixels. */
export const DEVICE_FONT = '12px "Times New Roman"';
/** Used until the page installs a real function: 6 pixels per character. */
const fixedWidth: TextMeasure = (text) => text.length * 6;
let current: TextMeasure = fixedWidth;
/** Installs the measurement function; null restores the default of 6 pixels per character. */
export function setTextMeasure(fn: TextMeasure | null): void {
  current = fn ?? fixedWidth;
}
/** Measures `text` in the device font with the installed function. */
export function measureText(text: string): number {
  return text === '' ? 0 : current(text, DEVICE_FONT);
}
