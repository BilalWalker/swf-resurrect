import { describe, expect, it } from 'vitest';
import { MalformedFrameDataError } from '../../src/convert/errors';
import type { TimelineOp, UnsupportedKind } from '../../src/convert/model';
import { resolveTimeline } from '../../src/convert/resolveTimeline';

const show: TimelineOp = { kind: 'showFrame' };
const m = (txTwips: number, tyTwips: number) => ({ a: 1, b: 0, c: 0, d: 1, txTwips, tyTwips });

function run(ops: TimelineOp[], declared: number | null = null, unsupported: Array<[number, UnsupportedKind]> = []) {
  return resolveTimeline({ spriteId: 6, ops, declaredFrameCount: declared, unsupportedCharacters: new Map(unsupported) });
}

describe('resolveTimeline', () => {
  it('places, persists state across frames and divides twips by 20', () => {
    const r = run([
      { kind: 'place', depth: 3, characterId: 9, move: false, matrix: m(8300, 5450), name: 'r' },
      { kind: 'place', depth: 1, characterId: 8, move: false, matrix: m(2870, 5400) },
      show,
      show,
    ], 2);
    expect(r.frames).toHaveLength(2);
    expect(r.frames[1]).toEqual(r.frames[0]);
    expect(r.frames[0]!.map((e) => e.depth)).toEqual([1, 3]);
    expect(r.frames[0]![0]!.matrix).toEqual([1, 0, 0, 1, 143.5, 270]);
    expect(r.frames[0]![1]!.matrix.slice(4)).toEqual([415, 272.5]);
    expect(r.frames[0]![1]!.name).toBe('r');
    expect(r.warnings).toEqual([]);
  });

  it('normalises -0 and keeps move/replace state', () => {
    const r = run([
      { kind: 'place', depth: 1, characterId: 2, move: false, matrix: m(-0, 0), name: 'n' },
      show,
      { kind: 'place', depth: 1, move: true, matrix: m(40, 0) },
      show,
      { kind: 'place', depth: 1, characterId: 5, move: true },
      show,
      { kind: 'remove', depth: 1 },
      show,
    ]);
    expect(Object.is(r.frames[0]![0]!.matrix[4], 0)).toBe(true);
    expect(r.frames[1]![0]).toMatchObject({ symbolId: 2, name: 'n' });
    expect(r.frames[1]![0]!.matrix[4]).toBe(2);
    expect(r.frames[2]![0]).toMatchObject({ symbolId: 5, name: 'n' });
    expect(r.frames[2]![0]!.matrix[4]).toBe(2);
    expect(r.frames[3]).toEqual([]);
  });

  it('records labels with 1-based frames, first duplicate wins', () => {
    const r = run([
      { kind: 'label', name: 'b' }, show,
      { kind: 'label', name: 'a' }, { kind: 'label', name: 'b' }, show,
    ]);
    expect(r.labels).toEqual([{ name: 'b', frame: 1 }, { name: 'a', frame: 2 }]);
    expect(r.warnings.some((w) => w.includes('duplicate label'))).toBe(true);
  });

  it('uses counted frames, warns on declared mismatch, empty and trailing ops', () => {
    const r = run([{ kind: 'place', depth: 1, characterId: 2, move: false }, show], 5);
    expect(r.frames).toHaveLength(1);
    expect(r.warnings.some((w) => w.includes('declared frame count 5') && w.includes('counted 1'))).toBe(true);
    const e = run([{ kind: 'place', depth: 1, characterId: 2, move: false }]);
    expect(e.frames).toEqual([[]]);
    expect(e.warnings.length).toBe(2);
  });

  it('drops unsupported characters, masks and filters and reports them once', () => {
    const r = run(
      [
        { kind: 'place', depth: 1, characterId: 40, move: false },
        { kind: 'place', depth: 2, characterId: 2, move: false, clipDepth: 5 },
        { kind: 'place', depth: 3, characterId: 2, move: false, hasFilters: true },
        { kind: 'place', depth: 4, characterId: 2, move: false },
        show,
        { kind: 'place', depth: 1, move: true, matrix: m(20, 20) },
        show,
      ],
      null,
      [[40, 'text']],
    );
    expect(r.droppedPlacements).toEqual([
      { spriteId: 6, frame: 1, depth: 1, kind: 'text', characterId: 40 },
      { spriteId: 6, frame: 1, depth: 2, kind: 'mask' },
      { spriteId: 6, frame: 1, depth: 3, kind: 'filter' },
    ]);
    expect(r.frames[0]!.map((e) => e.depth)).toEqual([4]);
    expect(r.frames[1]!.map((e) => e.depth)).toEqual([4]);
  });

  it('throws MalformedFrameDataError for fatal cases', () => {
    expect(() => run([{ kind: 'place', depth: 1, move: false }, show])).toThrow(MalformedFrameDataError);
    expect(() => run([{ kind: 'place', depth: 1, move: true }, show])).toThrow(MalformedFrameDataError);
    expect(() => run([{ kind: 'place', depth: 1, characterId: 2, move: true }, show])).toThrow(MalformedFrameDataError);
    const many: TimelineOp[] = Array.from({ length: 65536 }, () => show);
    expect(() => run(many)).toThrow(MalformedFrameDataError);
  });
});
