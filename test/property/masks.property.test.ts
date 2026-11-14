import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeClipLayout } from "../../template/runtime/clipLayout";
import { genClipItems } from "./gen/genSymbolGraph";

/** Property 12: Mask classification and layout (layout half; classification is added with sub-task 12.7). */
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
