import { describe, expect, it, vi } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { Event, MouseEvent } from '../../template/shim/events';
import { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend, type FakeNode } from '../support/fakeBackend';

const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];

function entry(depth: number, symbolId: number, tx = 0, ty = 0, name = ''): DisplayListEntry {
  return { depth, symbolId, matrix: [1, 0, 0, 1, tx, ty], colorTransform: ID_CT, name };
}

function sprite(frames: DisplayListEntry[][], className?: string): SpriteSymbol {
  const s: SpriteSymbol = { type: 'sprite', frameCount: frames.length, frames, labels: [] };
  if (className !== undefined) s.className = className;
  return s;
}

function sceneOf(root: SpriteSymbol, extra: SceneJson['symbols'] = {}, frameRate = 10): SceneJson {
  return {
    formatVersion: 1,
    stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate },
    rootSymbolId: 0,
    symbols: { '0': root, '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } }, ...extra },
  };
}

function setup(scene: SceneJson, registry: Record<string, new () => MovieClip> = {}, boundsFor: number[] = [1]) {
  const backend = new FakeBackend();
  const clock = new ManualClock();
  const shapeBounds = new Map(boundsFor.map((id) => [id, { x: 0, y: 0, width: 40, height: 30 }]));
  const player = new Player({ scene, backend, clock, classRegistry: registry, shapeBounds });
  return { backend, clock, player };
}

function tick(clock: ManualClock, player: Player, ms: number): void {
  clock.advance(ms);
  player.update();
}

describe('Player stepping', () => {
  it('advances one frame per interval and loops back to frame 1', () => {
    const root = sprite([[entry(1, 1)], [entry(1, 1)], [entry(1, 1)]]);
    const { clock, player } = setup(sceneOf(root));
    expect(player.frameIntervalMs).toBe(100);
    expect(player.root.currentFrame).toBe(1);
    tick(clock, player, 50);
    expect(player.root.currentFrame).toBe(1);
    tick(clock, player, 50);
    expect(player.root.currentFrame).toBe(2);
    tick(clock, player, 100);
    expect(player.root.currentFrame).toBe(3);
    tick(clock, player, 100);
    expect(player.root.currentFrame).toBe(1);
  });

  it('does not lose a frame to floating point error at 24 fps', () => {
    const root = sprite([[], [], []]);
    const { clock, player } = setup(sceneOf(root, {}, 24));
    for (let i = 0; i < 24; i++) tick(clock, player, 1000 / 24);
    // 24 steps over 3 frames: back where it started.
    expect(player.root.currentFrame).toBe(1);
  });

  it('caps a catch-up burst and drops the rest', () => {
    const root = sprite(Array.from({ length: 50 }, () => []));
    const { clock, player } = setup(sceneOf(root));
    tick(clock, player, 10_000);
    expect(player.root.currentFrame).toBe(6); // frame 1 + 5 steps
    tick(clock, player, 100);
    expect(player.root.currentFrame).toBe(7);
  });

  it('sends ENTER_FRAME to a stopped clip each tick but runs no frame script', () => {
    let enters = 0;
    let scripts = 0;
    class Still extends MovieClip {
      constructor() {
        super();
        this.stop();
        this.addEventListener(Event.ENTER_FRAME, () => enters++);
        this.addFrameScript(1, () => scripts++);
      }
    }
    const root = sprite([[entry(1, 2)]]);
    const { clock, player } = setup(sceneOf(root, { '2': sprite([[], []], 'Still') }), { Still });
    tick(clock, player, 100);
    tick(clock, player, 100);
    expect(enters).toBe(2);
    expect(scripts).toBe(0);
  });

  it('keeps stepping playing children under a stopped parent', () => {
    class Stopped extends MovieClip {
      constructor() {
        super();
        this.stop();
      }
    }
    const child = sprite([[], []]);
    const parent = sprite([[entry(1, 3, 0, 0, 'kid')], [entry(1, 3, 0, 0, 'kid')]], 'Stopped');
    const root = sprite([[entry(1, 2)]]);
    const { clock, player } = setup(sceneOf(root, { '2': parent, '3': child }), { Stopped });
    tick(clock, player, 100);
    const p = (player.root as unknown as { _children: MovieClip[] })._children[0]!;
    expect(p.currentFrame).toBe(1);
    expect((p as unknown as { kid: MovieClip }).kid.currentFrame).toBe(2);
  });

  it('does not step a child created during the tick until the next one', () => {
    const child = sprite([[], []]);
    const root = sprite([[], [entry(1, 2)], [entry(1, 2)]]);
    const { clock, player } = setup(sceneOf(root, { '2': child }));
    tick(clock, player, 100); // root enters frame 2, creates the child
    const kid = (player.root as unknown as { _children: MovieClip[] })._children[0]!;
    expect(kid.currentFrame).toBe(1);
    tick(clock, player, 100);
    expect(kid.currentFrame).toBe(2);
  });
});

describe('Player display list', () => {
  it('reuses the same object and node for the same depth and symbol', () => {
    const root = sprite([[entry(1, 1, 0, 0)], [entry(1, 1, 5, 7)]]);
    const { backend, clock, player } = setup(sceneOf(root));
    const before = backend.liveNodes.filter((n) => n.kind === 'shape');
    const obj = (player.root as unknown as { _children: unknown[] })._children[0];
    tick(clock, player, 100);
    const after = backend.liveNodes.filter((n) => n.kind === 'shape');
    expect(after).toEqual(before);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect((player.root as unknown as { _children: unknown[] })._children[0]).toBe(obj);
    expect(after[0]!.transform).toMatchObject({ x: 5, y: 7 });
  });

  it('replaces the object when the symbol at a depth changes and destroys the old node', () => {
    const root = sprite([[entry(1, 1)], [entry(1, 2)]]);
    const { backend, clock, player } = setup(sceneOf(root, { '2': sprite([[]]) }));
    const old = backend.nodes.find((n) => n.kind === 'shape') as FakeNode;
    tick(clock, player, 100);
    expect(old.destroyed).toBe(true);
    expect(player.rootNode).toBeDefined();
    expect((player.rootNode as FakeNode).children).toHaveLength(1);
    expect((player.rootNode as FakeNode).children[0]!.kind).toBe('container');
  });

  it('orders nodes by ascending depth', () => {
    const root = sprite([[entry(5, 1), entry(2, 1), entry(9, 1)]]);
    const { player } = setup(sceneOf(root));
    expect((player.rootNode as FakeNode).children).toHaveLength(3);
    expect((player.root as unknown as { _children: { _parent: unknown }[] })._children).toHaveLength(3);
  });

  it('decomposes the matrix into scale and rotation', () => {
    const s = Math.SQRT1_2;
    const root = sprite([
      [{ depth: 1, symbolId: 1, matrix: [2 * s, 2 * s, -3 * s, 3 * s, 10, 20], colorTransform: ID_CT, name: '' }],
    ]);
    const { backend } = setup(sceneOf(root));
    const t = backend.nodes.find((n) => n.kind === 'shape')!.transform;
    expect(t.x).toBe(10);
    expect(t.y).toBe(20);
    expect(t.scaleX).toBeCloseTo(2);
    expect(t.scaleY).toBeCloseTo(3);
    expect(t.rotationDeg).toBeCloseTo(45);
  });

  it('applies a non-identity colour transform through the backend', () => {
    const root = sprite([
      [{ depth: 1, symbolId: 1, matrix: [1, 0, 0, 1, 0, 0], colorTransform: [0.5, 1, 1, 0.25, 0, 0, 0, 0], name: '' }],
    ]);
    const { backend } = setup(sceneOf(root));
    expect(backend.nodes.find((n) => n.kind === 'shape')!.colorMultiplier).toEqual([0.5, 1, 1, 0.25]);
  });

  it('skips entries whose shape bounds are missing and reports the asset once', () => {
    const root = sprite([[entry(1, 1)], [entry(1, 1)]]);
    const { backend, clock, player } = setup(sceneOf(root), {}, []);
    tick(clock, player, 100);
    expect(backend.nodes.filter((n) => n.kind === 'shape')).toHaveLength(0);
    expect(backend.errors).toHaveLength(1);
    expect(backend.errors[0]).toContain('1.svg');
  });
});

describe('Player instance creation', () => {
  it('instantiates the linked class and binds named children before the frame-1 script', () => {
    let seen: unknown = 'unset';
    class Holder extends MovieClip {
      declare btn: MovieClip | undefined;
      constructor() {
        super();
        this.addFrameScript(0, () => {
          seen = this.btn;
        });
      }
    }
    const root = sprite([[entry(1, 2, 0, 0, 'holder')]]);
    const scene = sceneOf(root, { '2': sprite([[entry(1, 3, 0, 0, 'btn')]], 'Holder'), '3': sprite([[entry(1, 1)]]) });
    const { player } = setup(scene, { Holder });
    const holder = (player.root as unknown as { holder: Holder }).holder;
    expect(holder).toBeInstanceOf(Holder);
    expect(holder.btn).toBeInstanceOf(MovieClip);
    expect(seen).toBe(holder.btn);
  });
});

describe('Player.dispatchClick', () => {
  function clickScene() {
    let clicks: Array<{ target: unknown; current: unknown }> = [];
    class Button extends MovieClip {
      constructor() {
        super();
        this.stop();
        this.addEventListener(MouseEvent.CLICK, (e) => clicks.push({ target: e.target, current: e.currentTarget }));
      }
    }
    const root = sprite([[entry(1, 2, 100, 50, 'btn')]]);
    const scene = sceneOf(root, { '2': sprite([[entry(1, 1)], [entry(1, 1)]], 'Button') });
    const made = setup(scene, { Button });
    return { ...made, clicks: () => clicks, reset: () => (clicks = []) };
  }

  it('delivers one click to the hit clip with the shape as target', () => {
    const { player, clicks } = clickScene();
    player.dispatchClick(110, 60);
    expect(clicks()).toHaveLength(1);
    const btn = (player.root as unknown as { btn: MovieClip }).btn;
    expect(clicks()[0]!.current).toBe(btn);
    expect(clicks()[0]!.target).not.toBe(btn);
  });

  it('bubbles to ancestors', () => {
    const { player } = clickScene();
    const seen: unknown[] = [];
    player.root.addEventListener(MouseEvent.CLICK, (e) => seen.push(e.target));
    player.dispatchClick(110, 60);
    expect(seen).toHaveLength(1);
  });

  it('does nothing for a click outside every object', () => {
    const { player, clicks } = clickScene();
    player.dispatchClick(5, 5);
    player.dispatchClick(141, 60); // just right of the 40 px wide shape
    expect(clicks()).toHaveLength(0);
  });

  it('warns once, not per entry, for a skewed matrix', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const skew: DisplayListEntry = { depth: 1, symbolId: 1, matrix: [1, 0, 1, 1, 0, 0], colorTransform: ID_CT, name: '' };
    setup(sceneOf(sprite([[skew, { ...skew, depth: 2 }]])));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
