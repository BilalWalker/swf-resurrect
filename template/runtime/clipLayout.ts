// Clip layout (breadth design section 5, "Runtime"). Core: no node module, clock or randomness.
//
// An item with `clipDepth` is a mask: it masks every later item whose depth is above the mask depth and not above
// `clipDepth`. A mask inside another mask's range is not masked by it and starts its own range at its own depth
// (a model, not verified against Flash; no approved sample nests masks). An item covered by several ranges belongs to
// the latest mask in order whose range covers it, so it is in at most one group.

export interface ClipGroup {
  /** Index into `items` of the mask. */
  maskIndex: number;
  /** Indices into `items` of the masked items, in input order. */
  memberIndices: number[];
}

/** `items` are in ascending depth. Returns the groups (one per mask, in mask order) and the indices of all masks. */
export function computeClipLayout(items: ReadonlyArray<{ depth: number; clipDepth?: number }>): {
  groups: ClipGroup[];
  mask: ReadonlySet<number>;
} {
  const groups: ClipGroup[] = [];
  const mask = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    const clipDepth = items[i].clipDepth;
    if (clipDepth === undefined) continue;
    const g: ClipGroup = { maskIndex: i, memberIndices: [] };
    groups.push(g);
    mask.add(i);
  }
  for (let i = 0; i < items.length; i++) {
    if (mask.has(i)) continue;
    for (let g = groups.length - 1; g >= 0; g--) {
      const m = groups[g].maskIndex;
      if (m >= i) continue;
      if (items[i].depth > items[m].depth && items[i].depth <= (items[m].clipDepth as number)) {
        groups[g].memberIndices.push(i);
        break;
      }
    }
  }
  return { groups, mask };
}
