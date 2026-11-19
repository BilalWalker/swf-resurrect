// Feature: robustness, Property 30: the classes reached by string names are the closure of the literal graph: monotone and idempotent in the set of literals, equal to the emitted set, in a fixed order
// Validates: Requirements 27.5, 27.6
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { planTranslate } from '../../src/translate/planTranslate';
import { fcConfig } from './config';

const NAMES = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'] as const;
type Edges = ReadonlyArray<ReadonlyArray<number>>;

/** A class that holds the names of its edges as string literals (and no import, no extends). */
const source = (i: number, edges: Edges): string => {
  const lits = edges[i].map((j, k) => `      var s${k}:String = "${NAMES[j]}";\n`).join('');
  return `package {\n  public class ${NAMES[i]} {\n    public function ${NAMES[i]}() {\n${lits}    }\n  }\n}\n`;
};
const sources = (edges: Edges) => NAMES.map((n, i) => ({ className: n, source: source(i, edges) }));
const scene = { formatVersion: 3, rootSymbolId: 0, symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]], labels: [], className: 'C0' } } } as unknown as SceneJson;
// The syntax check is not under test; the plain parse of these classes is exact.
const noCheck = (): [] => [];
const reached = (edges: Edges, order?: (a: ReturnType<typeof sources>) => ReturnType<typeof sources>): string[] => {
  const s = sources(edges);
  return planTranslate(order ? order(s) : s, scene, noCheck).classes.map((c) => c.className);
};
/** The closure of C0 in the literal graph, computed without the planner, sorted by code unit. */
const closure = (edges: Edges): string[] => {
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length > 0) for (const j of edges[stack.pop() as number]) if (!seen.has(j)) (seen.add(j), stack.push(j));
  return [...seen].map((i) => NAMES[i]).sort();
};

const edgesArb: fc.Arbitrary<Edges> = fc.array(fc.uniqueArray(fc.integer({ min: 0, max: NAMES.length - 1 }), { maxLength: 4 }), { minLength: NAMES.length, maxLength: NAMES.length });

describe('Property 30: classes reached by string names', () => {
  it('the emitted set equals the closure of the literal graph, in code-unit order', () => {
    fc.assert(
      fc.property(edgesArb, (edges) => {
        expect(reached(edges)).toEqual(closure(edges));
      }),
      fcConfig,
    );
  });

  it('is monotone: more literals never remove a class', () => {
    fc.assert(
      fc.property(edgesArb, fc.integer({ min: 0, max: NAMES.length - 1 }), fc.integer({ min: 0, max: NAMES.length - 1 }), (edges, from, to) => {
        const more = edges.map((e, i) => (i === from && !e.includes(to) ? [...e, to] : e));
        const before = new Set(reached(edges));
        for (const n of reached(more)) before.delete(n);
        expect([...before]).toEqual([]);
      }),
      fcConfig,
    );
  });

  it('is idempotent: planning only the reached classes reaches the same set', () => {
    fc.assert(
      fc.property(edgesArb, (edges) => {
        const first = reached(edges);
        const kept = sources(edges).filter((s) => first.includes(s.className));
        expect(planTranslate(kept, scene, noCheck).classes.map((c) => c.className)).toEqual(first);
      }),
      fcConfig,
    );
  });

  it('is deterministic: the order of the sources does not change the result', () => {
    fc.assert(
      fc.property(edgesArb, (edges) => {
        expect(reached(edges, (s) => [...s].reverse())).toEqual(reached(edges));
      }),
      fcConfig,
    );
  });
});
