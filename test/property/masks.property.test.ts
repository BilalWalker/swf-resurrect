import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyMask, resolveMasks } from "../../src/convert/masks";
import { computeClipLayout } from "../../template/runtime/clipLayout";
import type { ColorTransform8, DisplayListEntry, ShapeSymbol, SpriteSymbol } from "../../template/runtime/scene";
import { fcConfig } from "./config";
import { genClipItems } from "./gen/genSymbolGraph";

/** Property 12: Mask classification and layout (classification half: 12.7, layout half: 12.5). */
/** Brute-force model of the Trivial_Mask rule (Requirement 12.3), written without sharing code with masks.ts. */
function modelTrivial(id: number, symbols: Record<string, ShapeSymbol | SpriteSymbol>): boolean {
  const s = symbols[String(id)];
  if (s === undefined) return false;
  if (s.type === "shape") return true;
  return s.frames.every((f) =>
    f.every((e) => {
      const c = symbols[String(e.symbolId)];
      return c !== undefined && c.type === "shape" && e.clipDepth === undefined && e.colorTransform.join() === "1,1,1,1,0,0,0,0";
    }),
  );
}

const ID_CT: ColorTransform8 = [1, 1, 1, 1, 0, 0, 0, 0];
const genCt: fc.Arbitrary<ColorTransform8> = fc.oneof(
  fc.constant(ID_CT),
  fc.constant(ID_CT),
  fc.constant<ColorTransform8>([1, 1, 1, 0.5, 0, 0, 0, 0]),
  fc.constant<ColorTransform8>([1, 1, 1, 1, 10, 0, 0, 0]),
);
/** Symbols 1..3 are shapes, 4..8 are sprites of random children (ids 1..9, 9 is undefined), mask placements on top. */
const genEntryOf = (depth: number): fc.Arbitrary<DisplayListEntry> =>
  fc.record({
    symbolId: fc.integer({ min: 1, max: 9 }),
    colorTransform: genCt,
    clip: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }),
  }).map(({ symbolId, colorTransform, clip }) => {
    const e: DisplayListEntry = { depth, symbolId, matrix: [1, 0, 0, 1, 0, 0], colorTransform, name: "" };
    if (clip !== undefined) e.clipDepth = depth + clip;
    return e;
  });
const genFrame: fc.Arbitrary<DisplayListEntry[]> = fc
  .integer({ min: 0, max: 4 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => genEntryOf(i + 1))))
  .map((a) => a as DisplayListEntry[]);
const genSymbols: fc.Arbitrary<Record<string, ShapeSymbol | SpriteSymbol>> = fc
  .array(fc.array(genFrame, { minLength: 1, maxLength: 3 }), { minLength: 5, maxLength: 5 })
  .map((sprites) => {
    const out: Record<string, ShapeSymbol | SpriteSymbol> = {};
    for (let i = 1; i <= 3; i += 1) {
      out[String(i)] = { type: "shape", file: `${i}.shape.json`, origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } };
    }
    sprites.forEach((frames, i) => {
      out[String(4 + i)] = { type: "sprite", frameCount: frames.length, frames, labels: [] };
    });
    return out;
  });

describe("Property 12: mask classification and resolution", () => {
  it("classifyMask equals the brute-force model, and resolveMasks keeps exactly the non-mask and trivial-mask entries", () => {
    // **Validates: Requirements 12.1, 12.3, 15.2, 15.5**
    fc.assert(
      fc.property(genSymbols, fc.array(genFrame, { minLength: 1, maxLength: 4 }), (symbols, frames) => {
        for (let id = 1; id <= 10; id += 1) {
          expect(classifyMask(id, symbols).trivial, `id ${id}`).toBe(modelTrivial(id, symbols));
        }
        const before = JSON.stringify(frames);
        const r = resolveMasks(3, frames, symbols);
        expect(JSON.stringify(frames)).toBe(before);
        expect(r.frames).toHaveLength(frames.length);
        let removed = 0;
        frames.forEach((f, fi) => {
          const expected = f.filter((e) => e.clipDepth === undefined || modelTrivial(e.symbolId, symbols));
          expect(r.frames[fi]).toEqual(expected);
          removed += f.length - expected.length;
        });
        // every removed entry is recorded at least once, never more often than it was removed
        expect(r.dropped.length).toBeLessThanOrEqual(removed);
        expect(r.dropped.length > 0).toBe(removed > 0);
        for (const d of r.dropped) expect(d.kind).toBe("mask");
        expect(resolveMasks(3, frames, symbols)).toEqual(r);
      }),
      fcConfig,
    );
  });
});

describe("Property 12: computeClipLayout", () => {
  it("groups each non-mask item at most once, inside its mask range, in order, and never lists a mask", () => {
    // **Validates: Requirements 12.1, 12.2, 15.2, 15.5**
    fc.assert(
      fc.property(genClipItems, (items) => {
        const { groups, mask } = computeClipLayout(items);
        const maskIdx = items.map((it, i) => (it.clipDepth !== undefined ? i : -1)).filter((i) => i >= 0);
        expect([...mask].sort((a, b) => a - b)).toEqual(maskIdx);
        expect(groups.map((g) => g.maskIndex)).toEqual(maskIdx);

        const seen = new Set<number>();
        for (const g of groups) {
          const m = items[g.maskIndex];
          for (const k of g.memberIndices) {
            expect(mask.has(k)).toBe(false);
            expect(seen.has(k)).toBe(false);
            seen.add(k);
            expect(items[k].depth).toBeGreaterThan(m.depth);
            expect(items[k].depth).toBeLessThanOrEqual(m.clipDepth as number);
          }
          expect([...g.memberIndices]).toEqual([...g.memberIndices].sort((a, b) => a - b));
        }
        // Everything else stays ungrouped: a non-mask item is grouped exactly when some earlier mask covers it.
        items.forEach((it, i) => {
          if (mask.has(i)) return;
          const covered = maskIdx.some(
            (m) => m < i && it.depth > items[m].depth && it.depth <= (items[m].clipDepth as number),
          );
          expect(seen.has(i)).toBe(covered);
        });
      }),
    );
  });
});
