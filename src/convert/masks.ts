// PURE: mask classification and resolution (design, section 5).
// No fs, child_process, clock, randomness or locale-dependent calls.
import type { ButtonSymbol, DisplayListEntry, ShapeSymbol, SpriteSymbol } from '../../template/runtime/scene';
import type { DroppedPlacement } from './resolveTimeline';

export type MaskClass = { trivial: true } | { trivial: false; reason: string };

type Symbols = Readonly<Record<string, ShapeSymbol | SpriteSymbol | ButtonSymbol>>;

function isIdentityCt(ct: DisplayListEntry['colorTransform']): boolean {
  return ct[0] === 1 && ct[1] === 1 && ct[2] === 1 && ct[3] === 1 && ct[4] === 0 && ct[5] === 0 && ct[6] === 0 && ct[7] === 0;
}

/**
 * Trivial_Mask: a shape symbol, or a sprite symbol whose every frame holds only shape entries with an identity
 * colour transform and no `clipDepth` (any matrix). Anything else is not drawn as a mask (Requirement 12.3).
 */
export function classifyMask(symbolId: number, symbols: Symbols): MaskClass {
  const sym = Object.prototype.hasOwnProperty.call(symbols, String(symbolId)) ? symbols[String(symbolId)] : undefined;
  if (sym === undefined) return { trivial: false, reason: `character ${symbolId} is not defined` };
  if (sym.type === 'shape') return { trivial: true };
  if (sym.type === 'button') return { trivial: false, reason: `character ${symbolId} is a button` };
  for (let fi = 0; fi < sym.frames.length; fi += 1) {
    for (const e of sym.frames[fi] as DisplayListEntry[]) {
      const child = Object.prototype.hasOwnProperty.call(symbols, String(e.symbolId)) ? symbols[String(e.symbolId)] : undefined;
      if (child === undefined || child.type !== 'shape') {
        return { trivial: false, reason: `frame ${fi + 1} places a non-shape character ${e.symbolId} at depth ${e.depth}` };
      }
      if (!isIdentityCt(e.colorTransform)) {
        return { trivial: false, reason: `frame ${fi + 1} applies a colour transform at depth ${e.depth}` };
      }
      if (e.clipDepth !== undefined) {
        return { trivial: false, reason: `frame ${fi + 1} holds a mask at depth ${e.depth}` };
      }
    }
  }
  return { trivial: true };
}

/** A kept mask placed inside the depth range of another kept mask. A report only: nothing is removed. */
export interface NestedMaskLimit {
  spriteId: number;
  frame: number; // first frame (1-based) in which the nested placement occurs
  depth: number;
  characterId: number;
}
/**
 * Removes every mask entry whose character is not a Trivial_Mask and records it as kind `mask`; a trivial mask is
 * kept with its `clipDepth`. A kept mask whose depth lies in `(outer.depth, outer.clipDepth]` of another kept mask
 * in the same frame is reported in `limits` once per sprite and placement (depth and character), at its first frame;
 * the layout does not change. A non-trivial mask that stays in the same place over consecutive frames is recorded once.
 * `frames` is not modified.
 */
export function resolveMasks(
  spriteId: number,
  frames: readonly DisplayListEntry[][],
  symbols: Symbols,
): { frames: DisplayListEntry[][]; dropped: DroppedPlacement[]; limits: NestedMaskLimit[] } {
  const dropped: DroppedPlacement[] = [];
  const limits: NestedMaskLimit[] = [];
  const reported = new Set<string>();
  const cache = new Map<number, boolean>();
  const trivial = (id: number): boolean => {
    let t = cache.get(id);
    if (t === undefined) {
      t = classifyMask(id, symbols).trivial;
      cache.set(id, t);
    }
    return t;
  };
  let previous = new Set<string>();
  const out = frames.map((frame, fi) => {
    const current = new Set<string>();
    const kept = frame.filter((e) => {
      if (e.clipDepth === undefined || trivial(e.symbolId)) return true;
      const key = `${e.depth}:${e.symbolId}`;
      current.add(key);
      if (!previous.has(key)) dropped.push({ spriteId, frame: fi + 1, depth: e.depth, kind: 'mask', characterId: e.symbolId });
      return false;
    });
    previous = current;
    const masks = kept.filter((e) => e.clipDepth !== undefined);
    for (const inner of masks) {
      const nested = masks.some((o) => o !== inner && inner.depth > o.depth && inner.depth <= (o.clipDepth as number));
      const key = `${inner.depth}:${inner.symbolId}`;
      if (nested && !reported.has(key)) {
        reported.add(key);
        limits.push({ spriteId, frame: fi + 1, depth: inner.depth, characterId: inner.symbolId });
      }
    }
    return kept;
  });
  return { frames: out, dropped, limits };
}
