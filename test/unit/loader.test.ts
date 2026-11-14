import { describe, expect, it } from 'vitest';
import { loadScene, SCENE_URL } from '../../template/runtime/loader';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson } from '../../template/runtime/scene';
import { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend } from '../support/fakeBackend';

const ID: [number, number, number, number, number, number, number, number] = [1, 1, 1, 1, 0, 0, 0, 0];

function entry(depth: number, symbolId: number, name = '') {
  return { depth, symbolId, matrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number], colorTransform: ID, name };
}

function scene(): SceneJson {
  return {
    formatVersion: 2,
    stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      '0': {
        type: 'sprite',
        frameCount: 1,
        frames: [[entry(1, 1, 'a'), entry(2, 2, 'b')]],
        labels: [],
      },
      '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
      '2': { type: 'shape', file: '2.shape.json', origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
    },
  };
}

const EMPTY_SHAPE = JSON.stringify({ formatVersion: 1, paths: [] });

function fetcher(files: Record<string, string>) {
  return async (url: string): Promise<string> => {
    const text = files[url];
    if (text === undefined) throw new Error('HTTP 404');
    return text;
  };
}

describe('loadScene', () => {
  it('shows an error naming Scene_JSON when it is unreachable (6.6)', async () => {
    const backend = new FakeBackend();
    const result = await loadScene(fetcher({}), backend);
    expect(result).toBeNull();
    expect(backend.errors).toHaveLength(1);
    expect(backend.errors[0]).toContain('Scene_JSON');
    expect(backend.nodes).toHaveLength(0);
  });

  it('shows an error naming Scene_JSON when it is invalid (6.6)', async () => {
    const backend = new FakeBackend();
    const result = await loadScene(fetcher({ [SCENE_URL]: '{not json' }), backend);
    expect(result).toBeNull();
    expect(backend.errors[0]).toContain('Scene_JSON');
    expect(backend.nodes).toHaveLength(0);
  });

  it('names the asset and returns no scene when an SVG fails to load (6.7)', async () => {
    const backend = new FakeBackend();
    const files = { [SCENE_URL]: JSON.stringify(scene()), 'assets/1.shape.json': EMPTY_SHAPE };
    const result = await loadScene(fetcher(files), backend);
    expect(result).toBeNull();
    expect(backend.errors).toHaveLength(1);
    expect(backend.errors[0]).toContain('2.shape.json');
    expect(backend.nodes).toHaveLength(0);
  });

  it('returns scene and bounds when everything loads', async () => {
    const backend = new FakeBackend();
    const files = { [SCENE_URL]: JSON.stringify(scene()), 'assets/1.shape.json': EMPTY_SHAPE, 'assets/2.shape.json': EMPTY_SHAPE };
    const result = await loadScene(fetcher(files), backend);
    expect(result).not.toBeNull();
    expect([...(result?.shapeBounds.keys() ?? [])].sort()).toEqual([1, 2]);
    expect(backend.errors).toEqual([]);
  });
});

describe('Player with an unloaded asset (6.8)', () => {
  it('skips the placement, renders the others and names the asset', () => {
    const backend = new FakeBackend();
    const bounds = new Map([[1, { x: 0, y: 0, width: 10, height: 10 }]]);
    const player = new Player({
      scene: scene(),
      backend,
      clock: new ManualClock(),
      classRegistry: {},
      shapeBounds: bounds,
    });
    expect(player.root.numChildren).toBe(1);
    expect(backend.liveNodes.filter((n) => n.kind === 'shape').map((n) => n.symbolId)).toEqual([1]);
    expect(backend.errors).toHaveLength(1);
    expect(backend.errors[0]).toContain('2.shape.json');
  });
});

describe('Unbindable instance name (8.6)', () => {
  it('leaves the property unset and keeps loading', () => {
    class Locked extends MovieClip {
      get a(): never {
        throw new Error('read only');
      }
    }
    const s = scene();
    const root = s.symbols['0'];
    if (root?.type === 'sprite') root.className = 'Locked';
    const backend = new FakeBackend();
    const bounds = new Map([
      [1, { x: 0, y: 0, width: 10, height: 10 }],
      [2, { x: 0, y: 0, width: 10, height: 10 }],
    ]);
    const player = new Player({
      scene: s,
      backend,
      clock: new ManualClock(),
      classRegistry: { Locked },
      shapeBounds: bounds,
    });
    expect(player.root.numChildren).toBe(2);
    expect((player.root as unknown as { b: unknown }).b).toBeDefined();
  });
});
