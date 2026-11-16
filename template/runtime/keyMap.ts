/**
 * Browser key to Flash key code (as3-coverage D4, Requirement 5). Pure: no DOM, no clock, no globals.
 * `code` is the physical key, so WASD stays where the player expects it on any layout; `keyCode` is the
 * fallback for a `code` this table does not know.
 */

export interface KeyLike {
  readonly code?: string;
  readonly keyCode?: number;
}

const NAMED: ReadonlyMap<string, number> = new Map([
  ['ArrowLeft', 37],
  ['ArrowUp', 38],
  ['ArrowRight', 39],
  ['ArrowDown', 40],
  ['Enter', 13],
  ['NumpadEnter', 13],
  ['Escape', 27],
  ['Space', 32],
]);

/** The Flash key code of a browser key event, or null when neither `code` nor `keyCode` gives one. */
export function flashKeyCode(event: KeyLike): number | null {
  const code = event.code;
  if (typeof code === 'string') {
    const named = NAMED.get(code);
    if (named !== undefined) return named;
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter !== null) return letter[1]!.charCodeAt(0);
    const digit = /^Digit([0-9])$/.exec(code);
    if (digit !== null) return 48 + Number(digit[1]);
  }
  const kc = event.keyCode;
  if (typeof kc === 'number' && Number.isInteger(kc) && kc > 0) return kc;
  return null;
}

/** True for the arrow keys and the space bar: the browser would scroll the page (Requirement 5.5). */
export function preventsDefault(flashCode: number): boolean {
  return (flashCode >= 37 && flashCode <= 40) || flashCode === 32;
}
