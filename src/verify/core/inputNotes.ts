// Input notes (breadth task 7.6, design section 9): the planner's input problems and the runner's
// release-outside records merged into one sorted list for the Fidelity_Report. Pure.
import type { PlanProblem } from './replayPlan';

/** Structural copy of `ReleaseOutsideNote` of `src/verify/edge/replayRunner.ts` (Core imports no Edge file). */
export interface ReleasedNote {
  upIndex: number;
  downIndex: number;
  pressed: string;
  hit: string;
  tick: number;
}

export type InputNote =
  | { kind: 'unsupported-input'; index: number; detail: string }
  | { kind: 'unpaired-mouse-event'; index: number }
  | { kind: 'release-outside'; index: number; downIndex: number; pressed: string; hit: string };

/**
 * Keeps `unsupported-input` and `unpaired-mouse-event` problems (`unused-input` is not an input note),
 * adds one `release-outside` per runner record, and sorts by `(index, kind)` with plain comparison.
 * The sort is stable, so equal keys keep their input order.
 */
export function buildInputNotes(problems: readonly PlanProblem[], released: readonly ReleasedNote[]): InputNote[] {
  const notes: InputNote[] = [];
  for (const p of problems) {
    if (p.kind === 'unsupported-input') notes.push({ kind: p.kind, index: p.index, detail: p.detail });
    else if (p.kind === 'unpaired-mouse-event') notes.push({ kind: p.kind, index: p.index });
  }
  for (const r of released) {
    notes.push({ kind: 'release-outside', index: r.upIndex, downIndex: r.downIndex, pressed: r.pressed, hit: r.hit });
  }
  return notes
    .map((note, order) => ({ note, order }))
    .sort((a, b) => {
      if (a.note.index !== b.note.index) return a.note.index - b.note.index;
      if (a.note.kind !== b.note.kind) return a.note.kind < b.note.kind ? -1 : 1;
      return a.order - b.order;
    })
    .map((e) => e.note);
}

/** One text line per note, in the order given. */
export function formatInputNotes(notes: readonly InputNote[]): string[] {
  return notes.map((n) => {
    switch (n.kind) {
      case 'release-outside':
        return `release-outside at entry ${n.index} (pressed ${n.pressed}, released over ${n.hit}; MouseDown at entry ${n.downIndex})`;
      case 'unpaired-mouse-event':
        return `unpaired-mouse-event at entry ${n.index}`;
      case 'unsupported-input':
        return `unsupported-input at entry ${n.index} (${n.detail})`;
    }
  });
}
