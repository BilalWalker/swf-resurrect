// Canonical Scene_JSON text. Pure: no I/O, no clock, no randomness.
// Printing is done by the shared canonicalJson writer in src/pipeline/canonicalJson.ts.

import { canonicalJson } from '../pipeline/canonicalJson';
import { DEFAULT_SCENE_NAME, parseScene, validateScene } from '../../template/runtime/scene';
import type { SceneJson, SpriteSymbol } from '../../template/runtime/scene';

export { parseScene };

/** Writes formatVersion 4 when the scene holds a button symbol and 3 otherwise, with the root's scenes (one scene at frame 1 when it has none). */
export function serialiseScene(input: SceneJson): string {
  const formatVersion = Object.values(input.symbols).some((s) => s.type === 'button') ? 4 : 3;
  const root = input.symbols[String(input.rootSymbolId)] as SpriteSymbol | undefined;
  const scene: SceneJson =
    root !== undefined && root.type === 'sprite'
      ? {
          ...input,
          formatVersion,
          symbols: {
            ...input.symbols,
            [String(input.rootSymbolId)]: { ...root, scenes: root.scenes ?? [{ name: DEFAULT_SCENE_NAME, firstFrame: 1 }] },
          },
        }
      : { ...input, formatVersion };
  const text = canonicalJson(scene, 'scene');
  // -0 is already normalised in the text; validate the result so invalid scenes never get written.
  validateScene(JSON.parse(text));
  return text;
}
