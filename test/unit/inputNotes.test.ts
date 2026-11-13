// Examples for buildInputNotes and formatInputNotes (breadth task 7.6).
// Validates: Requirements 14.9, 14.20, 14.21
import { describe, expect, it } from 'vitest';
import { buildInputNotes, formatInputNotes } from '../../src/verify/core/inputNotes';
import type { PlanProblem } from '../../src/verify/core/replayPlan';

describe('buildInputNotes', () => {
  it('returns nothing for nothing', () => {
    expect(buildInputNotes([], [])).toEqual([]);
  });

  it('drops unused-input, merges the rest and sorts by (index, kind)', () => {
    const problems: PlanProblem[] = [
      { kind: 'unused-input', index: 1 },
      { kind: 'unsupported-input', index: 9, detail: 'KeyDown' },
      { kind: 'unpaired-mouse-event', index: 21 },
    ];
    const notes = buildInputNotes(problems, [
      { upIndex: 21, downIndex: 17, pressed: 'root1.joystick', hit: 'stage', tick: 5 },
      { upIndex: 4, downIndex: 2, pressed: 'root1.a', hit: 'root1.b', tick: 1 },
    ]);
    expect(notes).toEqual([
      { kind: 'release-outside', index: 4, downIndex: 2, pressed: 'root1.a', hit: 'root1.b' },
      { kind: 'unsupported-input', index: 9, detail: 'KeyDown' },
      { kind: 'release-outside', index: 21, downIndex: 17, pressed: 'root1.joystick', hit: 'stage' },
      { kind: 'unpaired-mouse-event', index: 21 },
    ]);
  });
});

describe('formatInputNotes', () => {
  it('prints the design example for release-outside', () => {
    expect(
      formatInputNotes([{ kind: 'release-outside', index: 21, downIndex: 17, pressed: 'root1.joystick', hit: 'stage' }]),
    ).toEqual(['release-outside at entry 21 (pressed root1.joystick, released over stage; MouseDown at entry 17)']);
  });

  it('prints the other two kinds', () => {
    expect(
      formatInputNotes([
        { kind: 'unpaired-mouse-event', index: 3 },
        { kind: 'unsupported-input', index: 5, detail: 'KeyDown' },
      ]),
    ).toEqual(['unpaired-mouse-event at entry 3', 'unsupported-input at entry 5 (KeyDown)']);
  });
});
