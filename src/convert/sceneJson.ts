// Canonical Scene_JSON text. Pure: no I/O, no clock, no randomness.
// Printing is done by the shared canonicalJson writer in src/pipeline/canonicalJson.ts.

import { canonicalJson } from '../pipeline/canonicalJson';
import { DEFAULT_SCENE_NAME, parseScene, validateScene } from '../../template/runtime/scene';
import type { SceneJson, SpriteSymbol } from '../../template/runtime/scene';

export { parseScene };

/** Always writes formatVersion 3, with the root's scenes (one scene at frame 1 when it has none). */
export function serialiseScene(input: SceneJson): string {
  const root = input.symbols[String(input.rootSymbolId)] as SpriteSymbol | undefined;
  const scene: SceneJson =
    root !== undefined && root.type === 'sprite'
      ? {
          ...input,
          formatVersion: 3,
          symbols: {
            ...input.symbols,
            [String(input.rootSymbolId)]: { ...root, scenes: root.scenes ?? [{ name: DEFAULT_SCENE_NAME, firstFrame: 1 }] },
          },
        }
      : { ...input, formatVersion: 3 };
  const text = canonicalJson(scene, 'scene');
  // -0 is already normalised in the text; validate the result so invalid scenes never get written.
  validateScene(JSON.parse(text));
  return text;
}
