// Import-cycle hazards (Core, pure; design "Module-cycle hazards", Requirement 37). No node:* imports, no Date,
// no Math.random, no localeCompare.
//
// A class C that extends a translated base S is a hazard when S reaches C through value imports: whichever
// module the page enters first, a module in the cycle can run `class C extends S` before S is defined.
// The cut is an import whose every use is inside a method body or an instance field initialiser, so the
// use can be read through `getDefinitionByName` at run time and the import removed.

/** One value import of a class: `from` imports `to`; `cuttable` when no use is in an extends clause, a static initialiser or top-level code. */
export interface ImportEdge {
  from: string;
  to: string;
  cuttable: boolean;
}

export interface HazardInput {
  /** Derived class -> translated base class. */
  bases: ReadonlyMap<string, string>;
  /** Every value import, including the extends edge of each derived class (not cuttable). */
  edges: readonly ImportEdge[];
}

export interface Cut {
  from: string;
  to: string;
}

export interface ImportCycleProblem {
  className: string;
  /** The shortest import path from the base to the class, lexicographically first. */
  path: string[];
}

export interface HazardResult {
  /** Sorted by (from, to). */
  cuts: Cut[];
  /** Sorted by className. */
  problems: ImportCycleProblem[];
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Breadth-first distances from `start` over `adj` (neighbours already sorted). */
function distances(start: string, adj: ReadonlyMap<string, readonly string[]>): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const u = queue[q];
    for (const v of adj.get(u) ?? []) {
      if (dist.has(v)) continue;
      dist.set(v, (dist.get(u) as number) + 1);
      queue.push(v);
    }
  }
  return dist;
}

export function findImportCuts(input: HazardInput): HazardResult {
  const cuttable = new Map<string, boolean>(); // "from\0to" -> cuttable
  const key = (from: string, to: string): string => `${from}\u0000${to}`;
  for (const e of input.edges) {
    if (e.from === e.to) continue;
    const k = key(e.from, e.to);
    cuttable.set(k, (cuttable.get(k) ?? true) && e.cuttable);
  }
  const removed = new Set<string>();
  const cuts: Cut[] = [];
  const problems: ImportCycleProblem[] = [];

  const graphs = (): { fwd: Map<string, string[]>; rev: Map<string, string[]> } => {
    const fwd = new Map<string, string[]>();
    const rev = new Map<string, string[]>();
    for (const k of cuttable.keys()) {
      if (removed.has(k)) continue;
      const [from, to] = k.split('\u0000');
      fwd.set(from, [...(fwd.get(from) ?? []), to]);
      rev.set(to, [...(rev.get(to) ?? []), from]);
    }
    for (const list of fwd.values()) list.sort(cmp);
    for (const list of rev.values()) list.sort(cmp);
    return { fwd, rev };
  };

  for (const c of [...input.bases.keys()].sort(cmp)) {
    const s = input.bases.get(c) as string;
    if (s === c) continue;
    for (let guard = 0; guard <= cuttable.size; guard++) {
      const { fwd, rev } = graphs();
      const fromS = distances(s, fwd);
      const total = fromS.get(c);
      if (total === undefined) break; // no hazard (any more)
      const toC = distances(c, rev);
      const onPath = (u: string, v: string): boolean =>
        fromS.get(v) === (fromS.get(u) as number) + 1 && (fromS.get(v) as number) + (toC.get(v) ?? Infinity) === total;
      const edgesOnPaths: Cut[] = [];
      for (const [u, list] of fwd) {
        if (!fromS.has(u)) continue;
        for (const v of list) if (onPath(u, v)) edgesOnPaths.push({ from: u, to: v });
      }
      const canCut = (e: Cut): boolean => cuttable.get(key(e.from, e.to)) === true;
      const byEdge = (a: Cut, b: Cut): number => cmp(a.from, b.from) || cmp(a.to, b.to);
      // The imports of the base class first (Requirement 37.2); any other import on a shortest path when none of them can be cut.
      const own = edgesOnPaths.filter((e) => e.from === s && canCut(e)).sort(byEdge);
      const any = edgesOnPaths.filter(canCut).sort(byEdge);
      const chosen = own[0] ?? any[0];
      if (chosen === undefined) {
        const path = [s];
        for (let u = s; u !== c; ) {
          const next = (fwd.get(u) ?? []).find((v) => onPath(u, v)) as string;
          path.push(next);
          u = next;
        }
        problems.push({ className: c, path });
        break;
      }
      removed.add(key(chosen.from, chosen.to));
      cuts.push(chosen);
    }
  }
  cuts.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to));
  problems.sort((a, b) => cmp(a.className, b.className));
  return { cuts, problems };
}
