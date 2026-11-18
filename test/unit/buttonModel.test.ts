import { describe, expect, it } from 'vitest';
import { hitRegion, step, type ButtonEvent, type ButtonShapes, type ButtonState } from '../../template/runtime/buttonModel';

describe('buttonModel.step', () => {
  const rows: Array<[ButtonEvent, ButtonState]> = [
    ['rollOver', 'over'],
    ['rollOut', 'up'],
    ['press', 'down'],
    ['release', 'over'],
    ['releaseOutside', 'up'],
    ['mouseUpInside', 'up'],
    ['dragOut', 'over'],
    ['dragOver', 'down'],
  ];
  for (const [event, expected] of rows) {
    for (const from of ['up', 'over', 'down'] as const) {
      it(`${event} from ${from} gives ${expected}`, () => {
        expect(step(from, event)).toBe(expected);
      });
    }
  }
});

describe('buttonModel.hitRegion', () => {
  const at = (tx: number): { shape: string; matrix: [number, number, number, number, number, number] }[] => [
    { shape: `s${tx}`, matrix: [1, 0, 0, 1, tx, 0] },
  ];
  const button = (hit: ReturnType<typeof at>): ButtonShapes<string> => ({
    placement: [2, 0, 0, 2, 100, 50],
    states: { up: at(1), over: at(2), down: at(3), hit },
  });

  it('is the current state shapes united with the hit shapes', () => {
    const r = hitRegion(button(at(9)), 'over');
    expect(r.map((x) => x.shape)).toEqual(['s2', 's9']);
  });

  it('applies the placement transform to each shape', () => {
    const r = hitRegion(button(at(9)), 'up');
    expect(r[0]!.matrix).toEqual([2, 0, 0, 2, 102, 50]);
    expect(r[1]!.matrix).toEqual([2, 0, 0, 2, 118, 50]);
  });

  it('without hit records the current state shapes serve', () => {
    expect(hitRegion(button([]), 'down').map((x) => x.shape)).toEqual(['s3']);
  });

  it('leaves out the shapes of non-current states', () => {
    const shapes = hitRegion(button(at(9)), 'up').map((x) => x.shape);
    expect(shapes).not.toContain('s2');
    expect(shapes).not.toContain('s3');
  });
});
