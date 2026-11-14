import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveTimeline } from "../../src/convert/resolveTimeline";
import type { ColorTransformModel, MatrixModel, TimelineOp } from "../../src/convert/model";
import { fcConfig } from "./config";
import { genTimelineOps, UNSUPPORTED_CHARACTERS } from "./gen/genTimelineOps";

type Slot = { depth: number; id: number; m: MatrixModel; ct: ColorTransformModel; name: string };
type Row = { depth: number; symbolId: number; matrix: number[]; colorTransform: number[]; name: string };

const ID_M: MatrixModel = { a: 1, b: 0, c: 0, d: 1, txTwips: 0, tyTwips: 0 };
const ID_CT: ColorTransformModel = { mul: [1, 1, 1, 1], add: [0, 0, 0, 0] };
const z = (n: number): number => n + 0; // -0 -> 0

/** Independent array-based replay: a flat list of slots, linear search, sorted at snapshot. */
function replay(ops: TimelineOp[]): { frames: Row[][]; labels: Array<{ name: string; frame: number }> } {
  let slots: Slot[] = [];
  let dropped: number[] = [];
  const frames: Row[][] = [];
  const labels: Array<{ name: string; frame: number }> = [];
  let pending: string[] = [];
  const find = (d: number): number => slots.findIndex((s) => s.depth === d);

  for (const op of ops) {
    if (op.kind === "label") {
      pending.push(op.name);
    } else if (op.kind === "remove") {
      slots = slots.filter((s) => s.depth !== op.depth);
      dropped = dropped.filter((d) => d !== op.depth);
    } else if (op.kind === "place") {
      const at = find(op.depth);
      const unsup = op.characterId !== undefined && UNSUPPORTED_CHARACTERS.has(op.characterId);
      if (op.move && op.characterId === undefined && dropped.includes(op.depth)) continue;
      if (unsup) {
        slots = slots.filter((s) => s.depth !== op.depth);
        if (!dropped.includes(op.depth)) dropped.push(op.depth);
        continue;
      }
      dropped = dropped.filter((d) => d !== op.depth);
      const prev = at >= 0 ? slots[at] : undefined;
      const next: Slot = op.move
        ? {
            depth: op.depth,
            id: op.characterId ?? (prev as Slot).id,
            m: op.matrix ?? (prev as Slot).m,
            ct: op.colorTransform ?? (prev as Slot).ct,
            name: op.name ?? (prev as Slot).name,
          }
        : {
            depth: op.depth,
            id: op.characterId as number,
            m: op.matrix ?? ID_M,
            ct: op.colorTransform ?? ID_CT,
            name: op.name ?? "",
          };
      if (at >= 0) slots[at] = next;
      else slots.push(next);
    } else {
      const frame = frames.length + 1;
      const rows = [...slots]
        .sort((p, q) => p.depth - q.depth)
        .map((s) => ({
          depth: s.depth,
          symbolId: s.id,
          matrix: [z(s.m.a), z(s.m.b), z(s.m.c), z(s.m.d), z(s.m.txTwips / 20), z(s.m.tyTwips / 20)],
          colorTransform: [...s.ct.mul.map(z), ...s.ct.add.map(z)],
          name: s.name,
        }));
      frames.push(rows);
      for (const n of pending) if (!labels.some((l) => l.name === n)) labels.push({ name: n, frame });
      pending = [];
    }
  }
  if (frames.length === 0) frames.push([]);
  labels.sort((p, q) => p.frame - q.frame || (p.name < q.name ? -1 : p.name > q.name ? 1 : 0));
  return { frames, labels };
}

describe("resolveTimeline", () => {
  // Feature: vertical-slice, Property 4: Frame display lists equal an independent replay of the placement operations
  // **Validates: Requirements 4.3, 4.10, 4.11**
  it("frame display lists and labels equal an independent replay", () => {
    fc.assert(
      fc.property(genTimelineOps, (ops) => {
        const out = resolveTimeline({ spriteId: 0, ops, declaredFrameCount: null, unsupportedCharacters: UNSUPPORTED_CHARACTERS });
        const ref = replay(ops);
        expect(out.frames).toEqual(ref.frames);
        expect(out.labels).toEqual(ref.labels);
        for (const f of out.frames) {
          for (let i = 1; i < f.length; i++) expect(f[i].depth).toBeGreaterThan(f[i - 1].depth);
        }
      }),
      fcConfig,
    );
  });

  // Feature: breadth, Property 12 (resolver half): a placement with clipDepth is kept, never dropped as a mask
  // **Validates: Requirements 12.3**
  it("keeps placements that carry clipDepth, so the display lists still equal the replay and no mask is dropped", () => {
    fc.assert(
      fc.property(genTimelineOps, (plain) => {
        const ops = plain.map((op) => (op.kind === "place" && !op.move ? { ...op, clipDepth: op.depth + 2 } : op));
        const out = resolveTimeline({ spriteId: 0, ops, declaredFrameCount: null, unsupportedCharacters: UNSUPPORTED_CHARACTERS });
        const ref = replay(plain);
        expect(out.frames.map((f) => f.map(({ clipDepth: _c, ...row }) => row))).toEqual(ref.frames);
        expect(out.droppedPlacements.some((d) => d.kind === "mask")).toBe(false);
        for (const f of out.frames) for (const e of f) if (e.clipDepth !== undefined) expect(e.clipDepth).toBeGreaterThanOrEqual(e.depth);
      }),
      fcConfig,
    );
  });
});