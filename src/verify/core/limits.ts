// Known visual limits (design section 9, Requirement 5.6).
// Pure: no node:* imports, no clock, no randomness, no locale-dependent calls.
import { decomposeMatrix } from '../../../template/runtime/stageTree';
import type { SceneJson } from '../../../template/runtime/scene';
import type { UnsupportedFeatureEntry } from '../../pipeline/unsupported';

/** Re-exported by report.ts. */
export interface VisualLimit {
  kind:
    | 'colour-offset'
    | 'skewed-matrix'
    | 'unsupported-feature'
    | 'gradient-fill'
    | 'gradient-spread'
    | 'gradient-focal'
    | 'bitmap-fill'
    | 'bitmap-smoothing'
    | 'text-metrics'
    | 'stroke-style'
    | 'blend-mode'
    | 'residual-difference';
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

/** Unsupported kinds that become a limit of the same kind (id and message kept). */
const OWN_KINDS: ReadonlySet<string> = new Set([
  'gradient-fill',
  'gradient-spread',
  'gradient-focal',
  'bitmap-fill',
  'bitmap-smoothing',
  'text-metrics',
  'stroke-style',
  'blend-mode',
]);
export interface LimitOptions {
  /** True when every compared frame matched exactly; 	ext-metrics entries are then omitted. */
  allComparedFramesExact: boolean;
}
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
 * The backend draws the transform without its alpha add term (`stripAlphaAdd`). That is an
 * Exact_Render only for a positive add term with an alpha multiplier of at least 1: on an opaque
 * fill the Flash result clamps to the same opaque alpha (measured: `acid-color-2` with
 * alphaAddTerm 100, 0 differing pixels). Any other non-zero add term differs (measured with
 * alphaMultTerm 128 / alphaAddTerm 64 and alphaMultTerm 0 / alphaAddTerm 255; design section 4).
 * Not measured: a placement whose fills are semi-transparent.
 */
function alphaAddNotDrawnExactly(ct: readonly number[]): boolean {
  const add = ct[7] ?? 0;
  if (add === 0) return false;
  return !(add > 0 && (ct[3] ?? 1) >= 1);
}

/**
 * One entry per placement with an alpha add term that is not drawn exactly (`colour-offset`), one per skewed
 * matrix (`skewed-matrix`) and one per unsupported-feature entry of a visually relevant kind.
 * 	ext-metrics entries are omitted when opts.allComparedFramesExact is true.
 * Duplicates by (kind, id, message) are removed; the result is sorted.
 */
export function knownVisualLimits(
  scene: SceneJson,
  unsupported: readonly UnsupportedFeatureEntry[],
  opts: LimitOptions,
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
        if (alphaAddNotDrawnExactly(ct)) {
          found.push({
            kind: 'colour-offset',
            id: spriteId,
            message: `approximated: alpha add term (alphaAddTerm ${ct[7]}) is not drawn exactly: ${where}`,
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
    const own = OWN_KINDS.has(u.kind);
    if (!own && !LIMITED_KINDS.has(u.kind)) continue;
    if (u.kind === 'text-metrics' && opts.allComparedFramesExact) continue;
    const limit: VisualLimit = {
      kind: own ? (u.kind as VisualLimit['kind']) : 'unsupported-feature',
      message: u.message,
    };
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
