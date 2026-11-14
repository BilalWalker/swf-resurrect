import { describe, expect, it, vi } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { Matrix6, SceneJson, ColorTransform8 } from '../../template/runtime/scene';
import { decomposeMatrix } from '../../template/runtime/stageTree';
import { FakeBackend } from '../support/fakeBackend';

const ID: ColorTransform8 = [1, 1, 1, 1, 0, 0, 0, 0];

function sceneWith(m1: Matrix6, ct1: ColorTransform8, m2: Matrix6, ct2: ColorTransform8): SceneJson {
  return {
    formatVersion: 2,
    stage: { width: 550, height: 400, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      '0': {
        type: 'sprite',
        frameCount: 2,
        labels: [],
        frames: [
          [{ depth: 1, symbolId: 1, matrix: m1, colorTransform: ct1, name: '' }],
          [{ depth: 1, symbolId: 1, matrix: m2, colorTransform: ct2, name: '' }],
        ],
      },
      '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
    },
  };
}

function run(scene: SceneJson) {
  const backend = new FakeBackend();
  const clock = new ManualClock();
  const shapeBounds = new Map([[1, { x: 0, y: 0, width: 10, height: 10 }]]);
  const player = new Player({ scene, backend, clock, classRegistry: {}, shapeBounds });
  const shapeContainer = (): (typeof backend.nodes)[number] => {
    const root = backend.nodes[0];
    return root.children[0];
  };
  return { backend, clock, player, shapeContainer };
}

describe('decomposeMatrix', () => {
  it('reads [-1.4,0,0,-1.4,490,90] as scale 1.4 with 180 degrees and no skew', () => {
    const { t, skewed } = decomposeMatrix([-1.4, 0, 0, -1.4, 490, 90]);
    expect(skewed).toBe(false);
    expect(t.scaleX).toBeCloseTo(1.4, 10);
    expect(t.scaleY).toBeCloseTo(1.4, 10);
    expect(Math.abs(t.rotationDeg)).toBeCloseTo(180, 10);
    expect(t.x).toBe(490);
    expect(t.y).toBe(90);
  });

  it('reads a 30 degree rotation with scale 0.6', () => {
    const r = Math.PI / 6;
    const s = 0.6;
    const { t, skewed } = decomposeMatrix([s * Math.cos(r), s * Math.sin(r), -s * Math.sin(r), s * Math.cos(r), 0, 0]);
    expect(skewed).toBe(false);
    expect(t.scaleX).toBeCloseTo(0.6, 10);
    expect(t.scaleY).toBeCloseTo(0.6, 10);
    expect(t.rotationDeg).toBeCloseTo(30, 10);
  });
});

describe('Player matrix and colour transform path', () => {
  it('pushes scale, rotation and alpha multiplier to the backend without a skew warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const m1: Matrix6 = [0.6, 0, 0, 0.6, 100, 50];
      const m2: Matrix6 = [-1.4, 0, 0, -1.4, 490, 90];
      const { backend, clock, player, shapeContainer } = run(
        sceneWith(m1, ID, m2, [1, 1, 1, 0.5, 0, 0, 0, 0]),
      );

      const n = shapeContainer();
      expect(n.transform.scaleX).toBeCloseTo(0.6, 10);
      expect(n.transform.scaleY).toBeCloseTo(0.6, 10);
      expect(n.transform.rotationDeg).toBe(0);
      expect(n.colorMultiplier).toBeNull();
      expect(n.alpha).toBe(1);

      clock.advance(player.frameIntervalMs);
      player.update();

      const n2 = shapeContainer();
      expect(n2).toBe(n);
      expect(n2.transform.scaleX).toBeCloseTo(1.4, 10);
      expect(n2.transform.scaleY).toBeCloseTo(1.4, 10);
      expect(Math.abs(n2.transform.rotationDeg)).toBeCloseTo(180, 10);
      expect(n2.transform.x).toBe(490);
      expect(n2.transform.y).toBe(90);
      expect(n2.colorMultiplier).toEqual([1, 1, 1, 0.5]);
      expect(n2.colorOffset).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
