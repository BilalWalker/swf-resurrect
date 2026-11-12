// Phase A advances children first (design section 8, G5).
// Validates: Requirements 8.4, 8.8

import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { Event } from '../../template/shim/events';
import type { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend } from '../support/fakeBackend';

const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];

function entry(depth: number, symbolId: number, name = ''): DisplayListEntry {
  return { depth, symbolId, matrix: [1, 0, 0, 1, 0, 0], colorTransform: ID_CT, name };
}

function sprite(frames: DisplayListEntry[][]): SpriteSymbol {
  return { type: 'sprite', frameCount: frames.length, frames, labels: [] };
}

describe('advance order (G5)', () => {
  it('a child removal that bubbles to its parent sees the parent still on its old frame', () => {
    // root(1 frame) > parent(2 frames, keeps child) > child(2 frames: empty, then a shape at depth 1).
    // Tick 2 wraps both back to frame 1: the child removes the shape, `removed` bubbles to the parent.
    const child = sprite([[], [entry(1, 1)]]);
    const parent = sprite([[entry(1, 3, 'kid')], [entry(1, 3, 'kid')]]);
    const root = sprite([[entry(1, 2)]]);
    const scene: SceneJson = {
      formatVersion: 1,
      stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
      rootSymbolId: 0,
      symbols: { '0': root, '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } }, '2': parent, '3': child },
    };
    const clock = new ManualClock();
    const player = new Player({
      scene,
      backend: new FakeBackend(),
      clock,
      classRegistry: {},
      shapeBounds: new Map([[1, { x: 0, y: 0, width: 40, height: 30 }]]),
    });
    const p = (player.root as unknown as { _children: MovieClip[] })._children[0]!;
    const seen: number[] = [];
    p.addEventListener(Event.REMOVED, () => seen.push(p.currentFrame));

    clock.advance(100);
    player.update(); // both on frame 2; the shape is added
    expect(p.currentFrame).toBe(2);
    expect(seen).toEqual([]);

    clock.advance(100);
    player.update(); // both wrap to frame 1; the child removes the shape
    expect(p.currentFrame).toBe(1);
    expect(seen).toEqual([2]); // the parent had not advanced yet when `removed` bubbled
  });
});
