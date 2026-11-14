import type { RenderBackend, ShapeBounds } from './backend';
import { parseScene, type SceneJson } from './scene';
import { parseShapeJson } from './shapeJson';

export const SCENE_URL = 'assets/scene.json';
export const ASSET_BASE = 'assets/';

export interface LoadedScene {
  scene: SceneJson;
  shapeBounds: Map<number, ShapeBounds>;
}

/** Fetches text from a URL; rejects on network failure or a non-OK status. */
export type FetchText = (url: string) => Promise<string>;

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Loads Scene_JSON and every shape asset.
 * Returns null after showing an error through the backend when anything fails:
 * invalid or unreachable Scene_JSON (Req 6.6) or a failed or refused shape load (Req 6.7).
 * The caller must not start playback on null.
 */
export async function loadScene(fetchText: FetchText, backend: RenderBackend): Promise<LoadedScene | null> {
  let scene: SceneJson;
  try {
    scene = parseScene(await fetchText(SCENE_URL));
  } catch (err) {
    backend.showError(`Scene_JSON failed to load (${SCENE_URL}): ${describe(err)}`);
    return null;
  }

  const shapeBounds = new Map<number, ShapeBounds>();
  for (const [key, sym] of Object.entries(scene.symbols)) {
    if (sym.type !== 'shape') continue;
    const id = Number(key);
    try {
      const shape = parseShapeJson(await fetchText(`${ASSET_BASE}${sym.file}`));
      shapeBounds.set(id, await backend.loadShape(id, shape, ASSET_BASE));
    } catch (err) {
      backend.showError(`Shape asset ${sym.file} failed to load: ${describe(err)}`);
      return null;
    }
  }
  return { scene, shapeBounds };
}
