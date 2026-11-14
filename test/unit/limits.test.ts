import { describe, expect, it } from 'vitest';
import { knownVisualLimits } from '../../src/verify/core/limits';
import type { SceneJson } from '../../template/runtime/scene';
import type { UnsupportedFeatureEntry } from '../../src/pipeline/unsupported';

const scene = { formatVersion: 2, stage: { width: 1, height: 1, backgroundColor: '#ffffff', frameRate: 30 }, rootSymbolId: 0, symbols: {} } as unknown as SceneJson;
const entry = (kind: string, id: number | undefined, message: string): UnsupportedFeatureEntry =>
  ({ kind, message, ...(id === undefined ? {} : { id }) }) as UnsupportedFeatureEntry;
const OPEN = { allComparedFramesExact: false };

describe('knownVisualLimits kinds', () => {
  it.each(['gradient-fill', 'gradient-spread', 'gradient-focal', 'bitmap-fill', 'bitmap-smoothing', 'text-metrics', 'stroke-style', 'blend-mode'])(
    'keeps %s with id and message',
    (kind) => {
      expect(knownVisualLimits(scene, [entry(kind, 7, 'msg')], OPEN)).toEqual([{ kind, id: 7, message: 'msg' }]);
    },
  );
  it.each(['text', 'button', 'filter', 'mask', 'video', 'morph-shape'])('maps %s to unsupported-feature', (kind) => {
    expect(knownVisualLimits(scene, [entry(kind, undefined, 'm')], OPEN)).toEqual([{ kind: 'unsupported-feature', message: 'm' }]);
  });
  it('ignores kinds that are not visually relevant', () => {
    expect(knownVisualLimits(scene, [entry('class-omitted', 1, 'm'), entry('sound', 2, 'm')], OPEN)).toEqual([]);
  });
  it('omits text-metrics only when all compared frames are exact', () => {
    const u = [entry('text-metrics', 1, 'a'), entry('bitmap-fill', 2, 'b')];
    expect(knownVisualLimits(scene, u, { allComparedFramesExact: true }).map((l) => l.kind)).toEqual(['bitmap-fill']);
    expect(knownVisualLimits(scene, u, OPEN).map((l) => l.kind)).toEqual(['bitmap-fill', 'text-metrics']);
  });
  it('orders by kind, id, message and removes duplicates', () => {
    const u = [entry('stroke-style', 2, 'b'), entry('stroke-style', 2, 'b'), entry('stroke-style', 1, 'z'), entry('blend-mode', 9, 'a')];
    expect(knownVisualLimits(scene, u, OPEN)).toEqual([
      { kind: 'blend-mode', id: 9, message: 'a' },
      { kind: 'stroke-style', id: 1, message: 'z' },
      { kind: 'stroke-style', id: 2, message: 'b' },
    ]);
  });
});