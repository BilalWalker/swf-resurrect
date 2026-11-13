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