// Pure timeline lookups for MovieClip: nearest label and scene-aware goto targets. No state.
import type { SceneEntry } from '../runtime/scene';
import { ArgumentError } from './errors';
export const ONE_SCENE: readonly SceneEntry[] = [{ name: 'Scene 1', firstFrame: 1 }];
/** The label of the nearest labelled frame at or before `frame`, else null (Ruffle `get_current_label`). */
export function nearestLabel(labels: ReadonlyArray<{ name: string; frame: number }>, frame: number): string | null {
  let best: { name: string; frame: number } | null = null;
  for (const l of labels) {
    if (l.frame <= frame && (best === null || l.frame >= best.frame)) best = l;
  }
  return best === null ? null : best.name;
}
/** The scene that holds the global `frame` (the last scene whose first frame is at or before it). */
export function sceneIndexOf(scenes: readonly SceneEntry[], frame: number): number {
  let idx = 0;
  for (let i = 0; i < scenes.length; i++) if (scenes[i].firstFrame <= frame) idx = i;
  return idx;
}
/** `currentFrame` as AS3 reports it: relative to the scene that holds the global frame. */
export function sceneRelativeFrame(scenes: readonly SceneEntry[], frame: number): number {
  return frame - scenes[sceneIndexOf(scenes, frame)].firstFrame + 1;
}
/**
 * The global target of `gotoAndStop(frame, scene)`, or null when `frame` is invalid. A number is added to the start of
 * the named scene, or of the current scene when none is named; a label is global. A scene name that matches no scene
 * throws `ArgumentError`, also with a label.
 */
export function resolveGotoTarget(
  frame: number | string,
  scene: string | undefined,
  scenes: readonly SceneEntry[],
  labels: ReadonlyArray<{ name: string; frame: number }>,
  current: number,
  totalFrames: number,
): number | null {
  let base = scenes[sceneIndexOf(scenes, current)].firstFrame;
  if (scene !== undefined) {
    const named = scenes.find((s) => s.name === scene);
    if (named === undefined) throw new ArgumentError(`Error #2108: Scene ${scene} was not found.`, 2108);
    base = named.firstFrame;
  }
  if (typeof frame === 'string') return labels.find((l) => l.name === frame)?.frame ?? null;
  if (typeof frame !== 'number' || !Number.isInteger(frame)) return null;
  const target = base + frame - 1;
  return frame >= 1 && target >= 1 && target <= totalFrames ? target : null;
}
