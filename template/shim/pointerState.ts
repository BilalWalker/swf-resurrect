// The last pointer position in stage coordinates. Its own module so that Stage.ts can read it without importing
// internal.ts, which imports Stage.ts. internal.ts re-exports both functions.
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
