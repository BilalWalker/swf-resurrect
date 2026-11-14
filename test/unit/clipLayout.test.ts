import { describe, expect, it } from "vitest";
import { computeClipLayout } from "../../template/runtime/clipLayout";

describe("computeClipLayout", () => {
  it("returns nothing for no items", () => {
    const r = computeClipLayout([]);
    expect(r.groups).toEqual([]);
    expect(r.mask.size).toBe(0);
  });

  it("keeps a mask with an empty range as a group with no members", () => {
    const r = computeClipLayout([{ depth: 1, clipDepth: 1 }, { depth: 2 }]);
    expect(r.groups).toEqual([{ maskIndex: 0, memberIndices: [] }]);
    expect([...r.mask]).toEqual([0]);
  });

  it("groups items above the mask depth up to clipDepth only", () => {
    const r = computeClipLayout([{ depth: 1 }, { depth: 2, clipDepth: 4 }, { depth: 3 }, { depth: 4 }, { depth: 5 }]);
    expect(r.groups).toEqual([{ maskIndex: 1, memberIndices: [2, 3] }]);
  });

  it("starts a nested mask's own range and leaves it out of the outer group", () => {
    const r = computeClipLayout([
      { depth: 1, clipDepth: 6 },
      { depth: 2 },
      { depth: 3, clipDepth: 4 },
      { depth: 4 },
      { depth: 5 },
    ]);
    expect(r.groups).toEqual([
      { maskIndex: 0, memberIndices: [1, 4] },
      { maskIndex: 2, memberIndices: [3] },
    ]);
    expect([...r.mask]).toEqual([0, 2]);
  });

  it("handles two consecutive masks", () => {
    const r = computeClipLayout([{ depth: 1, clipDepth: 2 }, { depth: 2 }, { depth: 3, clipDepth: 4 }, { depth: 4 }]);
    expect(r.groups).toEqual([
      { maskIndex: 0, memberIndices: [1] },
      { maskIndex: 2, memberIndices: [3] },
    ]);
  });
});
