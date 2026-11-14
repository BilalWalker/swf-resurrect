// PURE: placement resolution for one timeline (design, "Placement resolution").
// No fs, child_process, clock, randomness or locale-dependent calls.
import type { ColorTransform8, DisplayListEntry, Matrix6 } from '../../template/runtime/scene';
import { MalformedFrameDataError } from './errors';
import type { ColorTransformModel, MatrixModel, TimelineOp, UnsupportedKind } from './model';

export const MAX_FRAMES = 65535;

export interface ResolveTimelineInput {
  /** 0 = root timeline, otherwise the sprite id. */
  spriteId: number;
  ops: readonly TimelineOp[];
  /** Declared frame count from the dump; only compared, never trusted. */
  declaredFrameCount: number | null;
  /** Character ids that are not rendered, with the kind to report (text, sound, button, video, morph-shape...). */
  unsupportedCharacters?: ReadonlyMap<number, UnsupportedKind>;
}

export interface DroppedPlacement {
  spriteId: number;
  frame: number; // 1-based
  depth: number;
  kind: UnsupportedKind; // 'mask' | kind of the unsupported character
  characterId?: number; // set when the drop is due to the character, not to a mask
}

/** A placement that stays in the display list although it carries a filter list or a blend mode (not drawn). */
export interface KeptPlacementLimit {
  spriteId: number;
  frame: number; // 1-based
  depth: number;
  characterId: number; // the placed character; for a move without character, the character at that depth
  kind: 'filter' | 'blend-mode';
}

export interface ResolvedTimeline {
  frames: DisplayListEntry[][];
  labels: Array<{ name: string; frame: number }>;
  droppedPlacements: DroppedPlacement[];
  keptWithLimit: KeptPlacementLimit[];
  warnings: string[];
}

interface Placed {
  symbolId: number;
  matrix: MatrixModel;
  colorTransform: ColorTransformModel;
  name: string;
}

const IDENTITY_MATRIX: MatrixModel = { a: 1, b: 0, c: 0, d: 1, txTwips: 0, tyTwips: 0 };
const IDENTITY_CT: ColorTransformModel = { mul: [1, 1, 1, 1], add: [0, 0, 0, 0] };

/** Divides by 20 and normalises -0 to 0. */
function twipsToPx(twips: number): number {
  const px = twips / 20;
  return px === 0 ? 0 : px;
}

function norm(n: number): number {
  return n === 0 ? 0 : n;
}

function isIndex(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function toEntry(depth: number, p: Placed): DisplayListEntry {
  const m = p.matrix;
  const matrix: Matrix6 = [norm(m.a), norm(m.b), norm(m.c), norm(m.d), twipsToPx(m.txTwips), twipsToPx(m.tyTwips)];
  const colorTransform: ColorTransform8 = [
    norm(p.colorTransform.mul[0]),
    norm(p.colorTransform.mul[1]),
    norm(p.colorTransform.mul[2]),
    norm(p.colorTransform.mul[3]),
    norm(p.colorTransform.add[0]),
    norm(p.colorTransform.add[1]),
    norm(p.colorTransform.add[2]),
    norm(p.colorTransform.add[3]),
  ];
  return { depth, symbolId: p.symbolId, matrix, colorTransform, name: p.name };
}

export function resolveTimeline(input: ResolveTimelineInput): ResolvedTimeline {
  const { spriteId, ops, declaredFrameCount } = input;
  const unsupported = input.unsupportedCharacters ?? new Map<number, UnsupportedKind>();
  const who: number | 'root' = spriteId === 0 ? 'root' : spriteId;
  const whoText = spriteId === 0 ? 'root timeline' : `sprite ${spriteId}`;

  const state = new Map<number, Placed>();
  const droppedDepths = new Set<number>();
  const frames: DisplayListEntry[][] = [];
  const labels: Array<{ name: string; frame: number }> = [];
  const seenLabels = new Set<string>();
  const droppedPlacements: DroppedPlacement[] = [];
  const keptWithLimit: KeptPlacementLimit[] = [];
  const warnings: string[] = [];
  let pendingLabels: string[] = [];
  let frame = 1;
  let trailingOps = 0;

  const bad = (item: string): never => {
    throw new MalformedFrameDataError(who, frame, item);
  };
  const drop = (depth: number, kind: UnsupportedKind, characterId?: number): void => {
    droppedPlacements.push(characterId === undefined ? { spriteId, frame, depth, kind } : { spriteId, frame, depth, kind, characterId });
    state.delete(depth);
    droppedDepths.add(depth);
  };

  for (const op of ops) {
    if (op.kind === 'showFrame') {
      if (frames.length >= MAX_FRAMES) {
        throw new MalformedFrameDataError(who, null, `more than ${MAX_FRAMES} frames`);
      }
      const depths = [...state.keys()].sort((x, y) => x - y);
      frames.push(depths.map((d) => toEntry(d, state.get(d) as Placed)));
      for (const name of pendingLabels) {
        if (seenLabels.has(name)) {
          warnings.push(`${whoText}: duplicate label "${name}" at frame ${frame} ignored`);
        } else {
          seenLabels.add(name);
          labels.push({ name, frame });
        }
      }
      pendingLabels = [];
      frame += 1;
      trailingOps = 0;
      continue;
    }
    trailingOps += 1;

    if (op.kind === 'label') {
      if (typeof op.name !== 'string') bad('label without name');
      pendingLabels.push(op.name);
    } else if (op.kind === 'remove') {
      if (!isIndex(op.depth)) bad(`invalid depth ${String(op.depth)}`);
      const removed = state.delete(op.depth);
      if (!removed && !droppedDepths.has(op.depth)) {
        warnings.push(`${whoText}, frame ${frame}: remove at empty depth ${op.depth}`);
      }
      droppedDepths.delete(op.depth);
    } else {
      const depth = op.depth;
      if (!isIndex(depth)) bad(`invalid depth ${String(depth)}`);
      const hasChar = op.characterId !== undefined;
      if (hasChar && !isIndex(op.characterId)) bad(`invalid character id ${String(op.characterId)}`);
      if (op.matrix && !(Number.isInteger(op.matrix.txTwips) && Number.isInteger(op.matrix.tyTwips))) {
        bad(`non-integer translation at depth ${depth}`);
      }

      if (op.move && !hasChar && droppedDepths.has(depth)) continue;

      if (op.clipDepth !== undefined) {
        drop(depth, 'mask');
        continue;
      }
      if (hasChar) {
        const kind = unsupported.get(op.characterId as number);
        if (kind !== undefined) {
          drop(depth, kind, op.characterId as number);
          continue;
        }
      }

      const old = state.get(depth);
      if (!op.move) {
        if (!hasChar) bad(`place without character at depth ${depth}`);
        if (old) warnings.push(`${whoText}, frame ${frame}: place replaces occupied depth ${depth}`);
        droppedDepths.delete(depth);
        state.set(depth, {
          symbolId: op.characterId as number,
          matrix: op.matrix ?? IDENTITY_MATRIX,
          colorTransform: op.colorTransform ?? IDENTITY_CT,
          name: op.name ?? '',
        });
      } else if (hasChar) {
        if (!old && !droppedDepths.has(depth)) bad(`move with character at empty depth ${depth}`);
        droppedDepths.delete(depth);
        state.set(depth, {
          symbolId: op.characterId as number,
          matrix: op.matrix ?? old?.matrix ?? IDENTITY_MATRIX,
          colorTransform: op.colorTransform ?? old?.colorTransform ?? IDENTITY_CT,
          name: op.name ?? old?.name ?? '',
        });
      } else {
        if (!old) bad(`move at empty depth ${depth}`);
        const prev = old as Placed;
        state.set(depth, {
          symbolId: prev.symbolId,
          matrix: op.matrix ?? prev.matrix,
          colorTransform: op.colorTransform ?? prev.colorTransform,
          name: op.name ?? prev.name,
        });
      }

      // The placement stays; the filter list and the blend mode are not drawn (Requirement 13.3).
      if (op.hasBlendMode || op.hasFilters) {
        const characterId = (state.get(depth) as Placed).symbolId;
        if (op.hasBlendMode) keptWithLimit.push({ spriteId, frame, depth, characterId, kind: 'blend-mode' });
        if (op.hasFilters) keptWithLimit.push({ spriteId, frame, depth, characterId, kind: 'filter' });
      }
    }
  }

  if (trailingOps > 0) {
    warnings.push(`${whoText}: ${trailingOps} operation(s) after the last showFrame ignored`);
  }

  const counted = frames.length;
  if (declaredFrameCount !== null && declaredFrameCount !== counted) {
    warnings.push(`${whoText}: declared frame count ${declaredFrameCount} differs from counted ${counted}; using counted`);
  }
  if (counted === 0) {
    warnings.push(`${whoText}: no showFrame found; using one empty frame`);
    frames.push([]);
  }

  labels.sort((x, y) => (x.frame !== y.frame ? x.frame - y.frame : x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  return { frames, labels, droppedPlacements, keptWithLimit, warnings };
}
