import { describe, expect, it } from 'vitest';
import { knownVisualLimits } from '../../src/verify/core/limits';
import type { SceneJson } from '../../template/runtime/scene';
import type { UnsupportedFeatureEntry } from '../../src/pipeline/unsupported';

const scene = { formatVersion: 2, stage: { width: 1, height: 1, backgroundColor: '#ffffff', frameRate: 30 }, rootSymbolId: 0, symbols: {} } as unknown as SceneJson;
const entry = (kind: string, id: number | undefined, message: string): UnsupportedFeatureEntry =>
  ({ kind, message, ...(id === undefined ? {} : { id }) }) as UnsupportedFeatureEntry;
const OPEN = { allComparedFramesExact: false };

const sceneWith = (ct: number[]): SceneJson =>
  ({
    ...scene,
    symbols: { 3: { type: 'sprite', frames: [[{ depth: 2, symbolId: 5, matrix: [1, 0, 0, 1, 0, 0], colorTransform: ct, name: '' }]] } },
  }) as unknown as SceneJson;
describe('knownVisualLimits colour-offset', () => {
  it.each([
    ['RGB offsets only', [1, 1, 1, 1, 255, 10, 0, 0]],
    ['positive alpha add, alpha multiplier 1 (measured exact)', [1, 1, 1, 1, 0, 0, 0, 100]],
  ])('records nothing for %s', (_n, ct) => {
    expect(knownVisualLimits(sceneWith(ct), [], OPEN)).toEqual([]);
  });
  it.each([
    ['alpha multiplier 0.5, add 64', [1, 1, 1, 0.5, 0, 0, 0, 64], 64],
    ['alpha multiplier 0, add 255', [1, 1, 1, 0, 0, 0, 0, 255], 255],
    ['negative alpha add', [1, 1, 1, 1, 0, 0, 0, -20], -20],
  ])('records a colour-offset limit for %s', (_n, ct, n) => {
    const out = knownVisualLimits(sceneWith(ct), [], OPEN);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('colour-offset');
    expect(out[0]?.id).toBe(3);
    expect(out[0]?.message).toContain(`approximated: alpha add term (alphaAddTerm ${n}) is not drawn exactly`);
  });
});
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