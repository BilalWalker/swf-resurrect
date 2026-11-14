import fc from "fast-check";

/** A node of a generated symbol graph: a sprite with named frame-1 children, in depth order. */
export interface SymbolNode {
  id: number;
  children: SymbolNode[];
}

/** Trees of at most three levels below the root, at most three children per node; ids are assigned in pre-order. */
const shape: fc.Memo<{ children: unknown[] }> = fc.memo((depth: number) =>
  depth <= 0
    ? fc.constant({ children: [] })
    : fc.record({ children: fc.array(shape(depth - 1), { maxLength: 3 }) }),
);

function number_(t: { children: unknown[] }, next: { n: number }): SymbolNode {
  const id = next.n++;
  return { id, children: (t.children as { children: unknown[] }[]).map((c) => number_(c, next)) };
}

/** Generator for Property 45: a symbol tree whose root has id 0. */
export const genSymbolGraph: fc.Arbitrary<SymbolNode> = shape(3).map((t) => number_(t, { n: 0 }));

/** Where a generated constructor throws: not at all, in a field initialiser, in the body, or before `super`. */
export type CtorThrow = "none" | "field" | "body" | "pre";

export interface ThrowFlags {
  ctor: CtorThrow;
  /** The frame-1 script throws instead of logging. */
  script: boolean;
  /** The enterFrame listener throws instead of logging. */
  listener: boolean;
}

export interface ThrowingGraph {
  tree: SymbolNode;
  /** Flags by symbol id. */
  flags: ThrowFlags[];
}

const genFlags: fc.Arbitrary<ThrowFlags> = fc.record({
  ctor: fc.constantFrom<CtorThrow>("none", "none", "field", "body", "pre"),
  script: fc.boolean(),
  listener: fc.boolean(),
});

/** Generator for Property 47: a symbol tree plus throwing flags for each symbol (ids are pre-order from 0). */
export const genThrowingGraph: fc.Arbitrary<ThrowingGraph> = fc.record({
  tree: genSymbolGraph,
  flags: fc.array(genFlags, { minLength: 40, maxLength: 40 }),
});

/** A child for the clip layout: a depth and, for a mask, a `clipDepth` of at least that depth. */
export interface ClipItem {
  depth: number;
  clipDepth?: number;
}

/** Generator for Property 12 (layout half): strictly ascending depths, about a third of them masks. */
export const genClipItems: fc.Arbitrary<ClipItem[]> = fc
  .array(
    fc.record({
      gap: fc.integer({ min: 1, max: 3 }),
      isMask: fc.boolean(),
      span: fc.integer({ min: 0, max: 8 }),
    }),
    { maxLength: 12 },
  )
  .map((rows) => {
    let depth = 0;
    return rows.map((r) => {
      depth += r.gap;
      return r.isMask ? { depth, clipDepth: depth + r.span } : { depth };
    });
  });
