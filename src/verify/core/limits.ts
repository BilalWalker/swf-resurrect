// Known visual limits (design section 9, Requirement 5.6).
// Pure: no node:* imports, no clock, no randomness, no locale-dependent calls.
import { decomposeMatrix } from '../../../template/runtime/stageTree';
import type { SceneJson } from '../../../template/runtime/scene';
import type { UnsupportedFeatureEntry } from '../../pipeline/unsupported';

/** Re-exported by report.ts. */
export interface VisualLimit {
  kind: 'colour-offset' | 'skewed-matrix' | 'unsupported-feature';
  id?: number;
  message: string;
}

const LIMITED_KINDS: ReadonlySet<string> = new Set([
  'text',
  'button',
  'filter',
  'mask',
  'video',
  'morph-shape',
]);

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0; // UTF-16 code unit order
}

/** Order: (kind, id, message). A missing id sorts as -1. */
function compareLimits(a: VisualLimit, b: VisualLimit): number {
  const ai = a.id ?? -1;
  const bi = b.id ?? -1;
  return cmpStr(a.kind, b.kind) || (ai < bi ? -1 : ai > bi ? 1 : 0) || cmpStr(a.message, b.message);
}

/**
 * One entry per placement with a non-zero colour offset (`colour-offset`), one per skewed
 * matrix (`skewed-matrix`) and one per unsupported-feature entry of a visually relevant kind.
 * Duplicates by (kind, id, message) are removed; the result is sorted.
 */
export function knownVisualLimits(
  scene: SceneJson,
  unsupported: readonly UnsupportedFeatureEntry[],
): VisualLimit[] {
  const found: VisualLimit[] = [];

  for (const key of Object.keys(scene.symbols)) {
    const sym = scene.symbols[key];
    if (sym === undefined || sym.type !== 'sprite') continue;
    const spriteId = Number(key);
    sym.frames.forEach((frame, fi) => {
      for (const entry of frame) {
        const where = `sprite ${spriteId}, frame ${fi + 1}, depth ${entry.depth} (symbol ${entry.symbolId})`;
        const ct = entry.colorTransform;
        if (ct[4] !== 0 || ct[5] !== 0 || ct[6] !== 0 || ct[7] !== 0) {
          found.push({
            kind: 'colour-offset',
            id: spriteId,
            message: `Colour offset is not rendered exactly: ${where}`,
          });
        }
        if (decomposeMatrix(entry.matrix).skewed) {
          found.push({
            kind: 'skewed-matrix',
            id: spriteId,
            message: `Skew is dropped from the matrix: ${where}`,
          });
        }
      }
    });
  }

  for (const u of unsupported) {
    if (!LIMITED_KINDS.has(u.kind)) continue;
    const limit: VisualLimit = { kind: 'unsupported-feature', message: u.message };
    if (u.id !== undefined) limit.id = u.id;
    found.push(limit);
  }

  found.sort(compareLimits);
  const out: VisualLimit[] = [];
  for (const l of found) {
    const prev = out[out.length - 1];
    if (prev !== undefined && compareLimits(prev, l) === 0) continue;
    out.push(l);
  }
  return out;
}
