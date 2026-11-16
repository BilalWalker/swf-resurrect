// Feature: as3-coverage, Property 28: Cuttable cycles load in any order
// Validates: Requirements 37.10
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { findImportCuts, type ImportEdge } from '../../src/translate/initHazards';
import { fcConfig } from './config';

interface Graph {
  n: number;
  bases: Map<string, string>;
  edges: ImportEdge[];
}

const name = (i: number): string => `C${i}`;

/** Class graphs: bases point to lower indices (no inheritance cycle); extra imports are arbitrary. */
const graphArb: fc.Arbitrary<Graph> = fc
  .integer({ min: 2, max: 7 })
  .chain((n) =>
    fc.record({
      n: fc.constant(n),
      baseOf: fc.array(fc.option(fc.nat(), { nil: undefined }), { minLength: n, maxLength: n }),
      extra: fc.array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1), fc.boolean()), { maxLength: 14 }),
    }),
  )
  .map(({ n, baseOf, extra }) => {
    const bases = new Map<string, string>();
    const edges: ImportEdge[] = [];
    baseOf.forEach((b, i) => {
      if (i === 0 || b === undefined) return;
      bases.set(name(i), name(b % i));
      edges.push({ from: name(i), to: name(b % i), cuttable: false });
    });
    for (const [a, b, cuttable] of extra) if (a !== b) edges.push({ from: name(a), to: name(b), cuttable });
    return { n, bases, edges };
  });

/** ES module evaluation: imports first (depth first, in order), then the body; `extends` needs an evaluated base. */
function loadsWithoutError(g: Graph, removed: ReadonlySet<string>, entryOrder: number[]): boolean {
  const imports = new Map<string, string[]>();
  for (const e of g.edges) {
    if (removed.has(`${e.from}>${e.to}`)) continue;
    imports.set(e.from, [...(imports.get(e.from) ?? []), e.to].sort());
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (m: string): boolean => {
    if (state.has(m)) return true;
    state.set(m, 'visiting');
    for (const dep of imports.get(m) ?? []) if (!visit(dep)) return false;
    const base = g.bases.get(m);
    if (base !== undefined && state.get(base) !== 'done') return false;
    state.set(m, 'done');
    return true;
  };
  return entryOrder.every((i) => visit(name(i)));
}

function permutations(n: number): number[][] {
  // Entry orders: each module first, then the rest ascending; plus the reverse. Enough to reach every cycle entry.
  const out: number[][] = [];
  for (let first = 0; first < n; first++) {
    out.push([first, ...Array.from({ length: n }, (_, i) => i).filter((i) => i !== first)]);
  }
  out.push(Array.from({ length: n }, (_, i) => n - 1 - i));
  return out;
}

describe('Property 28: Cuttable cycles load in any order', () => {
  it('after the cuts, graphs without a reported problem load from every entry module', () => {
    fc.assert(
      fc.property(graphArb, (g) => {
        const { cuts, problems } = findImportCuts({ bases: g.bases, edges: g.edges });
        if (problems.length > 0) return true; // reported, not silent (Requirement 37.5)
        const removed = new Set(cuts.map((c) => `${c.from}>${c.to}`));
        return permutations(g.n).every((order) => loadsWithoutError(g, removed, order));
      }),
      fcConfig,
    );
  });

  it('a reported problem is a real hazard: some entry order fails without cuts', () => {
    fc.assert(
      fc.property(graphArb, (g) => {
        const { problems } = findImportCuts({ bases: g.bases, edges: g.edges });
        if (problems.length === 0) return true;
        return permutations(g.n).some((order) => !loadsWithoutError(g, new Set(), order));
      }),
      fcConfig,
    );
  });
});
