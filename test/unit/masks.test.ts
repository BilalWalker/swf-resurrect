import { describe, expect, it } from 'vitest';
import { classifyMask, resolveMasks } from '../../src/convert/masks';
import type { ColorTransform8, DisplayListEntry, ShapeSymbol, SpriteSymbol } from '../../template/runtime/scene';

const ID_CT: ColorTransform8 = [1, 1, 1, 1, 0, 0, 0, 0];
const entry = (depth: number, symbolId: number, extra: Partial<DisplayListEntry> = {}): DisplayListEntry => ({
  depth,
  symbolId,
  matrix: [1, 0, 0, 1, 0, 0],
  colorTransform: ID_CT,
  name: '',
  ...extra,
});
const shape = (): ShapeSymbol => ({ type: 'shape', file: 'x.shape.json', origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
const sprite = (frames: DisplayListEntry[][]): SpriteSymbol => ({ type: 'sprite', frameCount: frames.length, frames, labels: [] });

describe('classifyMask', () => {
  const symbols: Record<string, ShapeSymbol | SpriteSymbol> = {
    '1': shape(),
    '2': sprite([[entry(1, 1, { matrix: [2, 0, 0, 2, 5, 5] })], []]), // shapes only, any matrix, an empty frame
    '3': sprite([[entry(1, 2)]]), // holds a sprite
    '4': sprite([[entry(1, 1, { colorTransform: [1, 1, 1, 0.5, 0, 0, 0, 0] })]]),
    '5': sprite([[entry(1, 1, { clipDepth: 2 })]]), // nested clip
    '6': sprite([[]]), // empty
    '7': sprite([[entry(1, 99)]]), // unknown child
  };
  it('a shape is trivial', () => expect(classifyMask(1, symbols)).toEqual({ trivial: true }));
  it('a sprite of shapes with identity colour transform is trivial, whatever the matrix', () => {
    expect(classifyMask(2, symbols)).toEqual({ trivial: true });
  });
  it('an empty sprite is trivial', () => expect(classifyMask(6, symbols)).toEqual({ trivial: true }));
  it('a sprite that holds a sprite is not trivial', () => expect(classifyMask(3, symbols).trivial).toBe(false));
  it('a colour transform makes it not trivial', () => expect(classifyMask(4, symbols).trivial).toBe(false));
  it('a nested clip makes it not trivial', () => expect(classifyMask(5, symbols).trivial).toBe(false));
  it('an unknown character is not trivial', () => {
    expect(classifyMask(42, symbols).trivial).toBe(false);
    expect(classifyMask(7, symbols).trivial).toBe(false);
  });
});

describe('resolveMasks', () => {
  const symbols: Record<string, ShapeSymbol | SpriteSymbol> = {
    '1': shape(),
    '3': sprite([[entry(1, 1)], [entry(1, 1)]]),
    '4': sprite([[entry(1, 3)]]), // not trivial
  };
  it('keeps a trivial shape mask with its clipDepth', () => {
    const frames = [[entry(1, 1, { clipDepth: 3 }), entry(2, 1)]];
    const r = resolveMasks(0, frames, symbols);
    expect(r.frames).toEqual(frames);
    expect(r.dropped).toEqual([]);
  });
  it('keeps a trivial sprite mask', () => {
    const frames = [[entry(1, 3, { clipDepth: 2 })]];
    expect(resolveMasks(0, frames, symbols).frames).toEqual(frames);
  });
  it('removes a non-trivial mask and records it once while it stays in place', () => {
    const frames = [
      [entry(1, 4, { clipDepth: 2 }), entry(2, 1)],
      [entry(1, 4, { clipDepth: 2 }), entry(2, 1)],
      [entry(2, 1)],
      [entry(1, 4, { clipDepth: 2 }), entry(2, 1)],
    ];
    const r = resolveMasks(7, frames, symbols);
    expect(r.frames.map((f) => f.map((e) => e.depth))).toEqual([[2], [2], [2], [2]]);
    expect(r.dropped).toEqual([
      { spriteId: 7, frame: 1, depth: 1, kind: 'mask', characterId: 4 },
      { spriteId: 7, frame: 4, depth: 1, kind: 'mask', characterId: 4 },
    ]);
    expect(frames[0]).toHaveLength(2); // input untouched
  });
  it('handles a mask with an empty range and a nested clip inside a kept mask', () => {
    const frames = [[entry(1, 1, { clipDepth: 1 }), entry(2, 1, { clipDepth: 4 }), entry(3, 1)]];
    const r = resolveMasks(0, frames, symbols);
    expect(r.frames).toEqual(frames);
    expect(r.dropped).toEqual([]);
  });
});
