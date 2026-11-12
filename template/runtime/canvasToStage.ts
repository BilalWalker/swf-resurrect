export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Maps a pointer event position (client pixels) to stage coordinates. The canvas may be scaled by CSS,
 * so the position is scaled by stage size over rect size. Returns null for an empty rect.
 */
export function canvasToStage(
  ev: { clientX: number; clientY: number },
  rect: CanvasRect,
  stage: { width: number; height: number },
): { x: number; y: number } | null {
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: ((ev.clientX - rect.left) * stage.width) / rect.width,
    y: ((ev.clientY - rect.top) * stage.height) / rect.height,
  };
}
