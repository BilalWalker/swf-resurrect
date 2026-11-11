// Canonical Scene_JSON text. Pure: no I/O, no clock, no randomness.
// Printing is done by the shared canonicalJson writer in src/pipeline/canonicalJson.ts.

import { canonicalJson } from '../pipeline/canonicalJson';
import { parseScene, validateScene } from '../../template/runtime/scene';
import type { SceneJson } from '../../template/runtime/scene';

export { parseScene };

export function serialiseScene(scene: SceneJson): string {
  const text = canonicalJson(scene, 'scene');
  // -0 is already normalised in the text; validate the result so invalid scenes never get written.
  validateScene(JSON.parse(text));
  return text;
}
