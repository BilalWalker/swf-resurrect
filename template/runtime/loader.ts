import type { RenderBackend, ShapeBounds } from './backend';
import { parseScene, type SceneJson } from './scene';

export const SCENE_URL = 'assets/scene.json';

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
 * invalid or unreachable Scene_JSON (Req 6.6) or a failed SVG load (Req 6.7).
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
      const svg = await fetchText(`assets/${sym.file}`);
      shapeBounds.set(id, await backend.loadShape(id, svg, sym.origin));
    } catch (err) {
      backend.showError(`SVG asset ${sym.file} failed to load: ${describe(err)}`);
      return null;
    }
  }
  return { scene, shapeBounds };
}
