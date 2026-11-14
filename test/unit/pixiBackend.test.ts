/// <reference lib="dom" />
// Sub-task 10.12 (the refused fill is a bitmap since 11.3 draws radial gradients): the loader path with the FakeBackend, and the PixiBackend refusal of undrawn fills.
// Validates: Requirements 2.8, 7.11, 13.8, 12.4
import { describe, expect, it } from 'vitest';
import { loadScene, SCENE_URL } from '../../template/runtime/loader';
import { PixiBackend } from '../../template/runtime/pixi/pixiBackend';
import type { SceneJson } from '../../template/runtime/scene';
import { ShapeJsonError, type ShapeJson } from '../../template/runtime/shapeJson';
import { FakeBackend } from '../support/fakeBackend';

const contours = [{ outer: [['M', 0, 0], ['L', 9, 0], ['L', 9, 9], ['Z']] as never, holes: [] }];
const solidShape: ShapeJson = {
  formatVersion: 1,
  paths: [{ contours, fill: { kind: 'solid', color: '#ff0000', alpha: 1 }, stroke: null }],
};
const gradientShape: ShapeJson = {
  formatVersion: 1,
  paths: [
    { contours, fill: { kind: 'solid', color: '#ff0000', alpha: 1 }, stroke: null },
    {
      contours,
      fill: {
        kind: 'bitmap',
        image: 'images/5.png',
        matrix: [1, 0, 0, 1, 0, 0],
        smooth: true,
      },
      stroke: null,
    },
  ],
};

const scene: SceneJson = {
  formatVersion: 2,
  stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
  rootSymbolId: 0,
  symbols: {
    '0': {
      type: 'sprite',
      frameCount: 1,
      frames: [[{ depth: 1, symbolId: 1, matrix: [1, 0, 0, 1, 0, 0], colorTransform: [1, 1, 1, 1, 0, 0, 0, 0], name: '' }]],
      labels: [],
    },
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 9, height: 9 } },
  },
};

const fetcher = (shape: ShapeJson) => async (url: string): Promise<string> => {
  if (url === SCENE_URL) return JSON.stringify(scene);
  if (url === 'assets/1.shape.json') return JSON.stringify(shape);
  throw new Error('HTTP 404');
};

describe('loadScene with a drawable Shape_JSON', () => {
  it('loads the shape through parseShapeJson and shows no error', async () => {
    const backend = new FakeBackend();
    const result = await loadScene(fetcher(solidShape), backend);
    expect(result).not.toBeNull();
    expect(result?.shapeBounds.has(1)).toBe(true);
    expect(backend.errors).toEqual([]);
  });
});

describe('a fill that is not drawn is refused, never skipped', () => {
  it('the loader shows the field path and returns no scene (FakeBackend)', async () => {
    const backend = new FakeBackend();
    const result = await loadScene(fetcher(gradientShape), backend);
    expect(result).toBeNull();
    expect(backend.errors).toHaveLength(1);
    expect(backend.errors[0]).toContain('1.shape.json');
    expect(backend.errors[0]).toContain('paths[1].fill: fill kind not drawn: bitmap');
    expect(backend.nodes).toHaveLength(0);
  });

  it('PixiBackend.loadShape throws a ShapeJsonError with the field path', async () => {
    await expect(new PixiBackend().loadShape(1, gradientShape, 'assets/')).rejects.toThrow(ShapeJsonError);
    await expect(new PixiBackend().loadShape(1, gradientShape, 'assets/')).rejects.toThrow(
      'paths[1].fill: fill kind not drawn: bitmap',
    );
  });
});

describe('PixiBackend draws solid fills, holes and strokes', () => {
  it('returns the bounds of the drawn contours', async () => {
    const b = await new PixiBackend().loadShape(1, solidShape, 'assets/');
    expect(b.x).toBeCloseTo(0, 5);
    expect(b.width).toBeCloseTo(9, 5);
    expect(b.height).toBeCloseTo(9, 5);
  });

  it('draws a hole and a stroke without throwing; a stroke widens the bounds by half its width', async () => {
    const shape: ShapeJson = {
      formatVersion: 1,
      paths: [
        {
          contours: [
            {
              outer: [['M', 0, 0], ['L', 20, 0], ['L', 20, 20], ['L', 0, 20], ['Z']] as never,
              holes: [[['M', 5, 5], ['L', 5, 15], ['L', 15, 15], ['L', 15, 5], ['Z']] as never],
            },
          ],
          fill: { kind: 'solid', color: '#00ff00', alpha: 0.5 },
          stroke: { color: '#000000', alpha: 1, width: 4, cap: 'round', join: 'round', miterLimit: 4 },
        },
      ],
    };
    const b = await new PixiBackend().loadShape(1, shape, 'assets/');
    expect(b.x).toBeCloseTo(-2, 0);
    expect(b.width).toBeCloseTo(24, 0);
  });
});
