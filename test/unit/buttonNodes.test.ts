import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { ButtonSymbol, DisplayListEntry, SceneJson } from '../../template/runtime/scene';
import { MouseEvent } from '../../template/shim/events';
import { SimpleButton } from '../../template/shim/SimpleButton';
import { FakeBackend, type FakeNode } from '../support/fakeBackend';

const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
const SHAPE = (file: string): SceneJson['symbols'][string] => ({ type: 'shape', file, origin: { x: 0, y: 0 }, size: { width: 40, height: 30 } });

function entry(depth: number, symbolId: number, matrix: DisplayListEntry['matrix'] = [1, 0, 0, 1, 0, 0]): DisplayListEntry {
  return { depth, symbolId, matrix, colorTransform: ID_CT, name: '' };
}

// Shape ids: 1 up, 3 over and down, 4 hit. Each is 40 x 30 at its own place so a point tells which one it is in.
const BUTTON: ButtonSymbol = {
  type: 'button',
  trackAsMenu: false,
  states: {
    up: [entry(1, 1)],
    over: [entry(1, 3, [1, 0, 0, 1, 100, 0])],
    down: [entry(1, 3, [1, 0, 0, 1, 100, 0])],
    hit: [entry(1, 4, [1, 0, 0, 1, 0, 100])],
  },
};

function build(placement: DisplayListEntry['matrix'] = [1, 0, 0, 1, 0, 0], className?: string, registry: Record<string, new () => SimpleButton> = {}) {
  const button: ButtonSymbol = className === undefined ? BUTTON : { ...BUTTON, className };
  const scene: SceneJson = {
    formatVersion: 4,
    stage: { width: 300, height: 300, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      '0': { type: 'sprite', frameCount: 1, frames: [[entry(1, 2, placement)]], labels: [] },
      '1': SHAPE('1.shape.json'),
      '2': button,
      '3': SHAPE('3.shape.json'),
      '4': SHAPE('4.shape.json'),
    },
  };
  const backend = new FakeBackend();
  const clock = new ManualClock();
  const shapeBounds = new Map([1, 3, 4].map((id) => [id, { x: 0, y: 0, width: 40, height: 30 }]));
  const player = new Player({ scene, backend, clock, classRegistry: registry, shapeBounds });
  const btn = player.root.getChildAt(0) as SimpleButton;
  const tick = (): void => {
    clock.advance(100);
    player.update();
  };
  return { backend, player, btn, tick };
}

/** The symbol ids of the shape nodes reachable from the stage node, in tree order. */
function drawnShapes(node: FakeNode): number[] {
  const out: number[] = [];
  const walk = (n: FakeNode): void => {
    if (n.kind === 'shape' && n.symbolId !== null) out.push(n.symbolId);
    for (const c of n.children) walk(c);
  };
  walk(node);
  return out;
}

describe('button nodes (FakeBackend)', () => {
  it('draws only the current state, and never the hit shapes', () => {
    const { backend, player, btn, tick } = build();
    expect(btn).toBeInstanceOf(SimpleButton);
    expect(drawnShapes(player.stageNode as FakeNode)).toEqual([1]);
    // The hit shape has no backend node at all.
    expect(backend.nodes.filter((n) => n.symbolId === 4)).toEqual([]);

    btn._setState('over');
    tick();
    expect(drawnShapes(player.stageNode as FakeNode)).toEqual([3]);
    btn._setState('down');
    tick();
    expect(drawnShapes(player.stageNode as FakeNode)).toEqual([3]);
    btn._setState('up');
    tick();
    expect(drawnShapes(player.stageNode as FakeNode)).toEqual([1]);
    expect(backend.nodes.filter((n) => n.symbolId === 4)).toEqual([]);
  });

  it('draws the up state of a disabled button whatever state the model is in', () => {
    const { player, btn, tick } = build();
    btn._setState('down');
    tick();
    expect(drawnShapes(player.stageNode as FakeNode)).toEqual([3]);
    btn.enabled = false;
    tick();
    expect(drawnShapes(player.stageNode as FakeNode)).toEqual([1]);
    btn.enabled = true;
    tick();
    expect(drawnShapes(player.stageNode as FakeNode)).toEqual([3]);
  });

  it('gives a rotated, scaled placement the transform of any other symbol', () => {
    // Matrix of rotation 90 degrees and scale 2: a = 0, b = 2, c = -2, d = 0, then a translation.
    const { backend, btn } = build([0, 2, -2, 0, 60, 70]);
    const node = backend.nodes.find((n) => n.kind === 'container' && n.transform.x === 60 && n.transform.y === 70);
    expect(node).toBeDefined();
    expect(node!.transform.scaleX).toBeCloseTo(2);
    expect(node!.transform.scaleY).toBeCloseTo(2);
    expect(node!.transform.rotationDeg).toBeCloseTo(90);
    expect(btn.x).toBe(60);
    expect(btn.rotation).toBeCloseTo(90);
    // The state container and its shape keep their own (identity) transforms inside it.
    const shape = backend.nodes.find((n) => n.symbolId === 1)!;
    expect(shape.transform).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 });
  });
});

describe('button hit region (Player)', () => {
  function clickAt(x: number, y: number, setup: (btn: SimpleButton) => void = () => {}): number {
    const { player, btn } = build();
    setup(btn);
    let clicks = 0;
    // A click would move the state, and so the region, before the release; the first hover entry is tested under the state set above.
    btn.addEventListener(MouseEvent.MOUSE_OVER, () => clicks++);
    player.dispatchMouseMove(x, y);
    return clicks;
  }

  it('hits inside the current state and inside the hit state, not in a state that is not current', () => {
    expect(clickAt(20, 15)).toBe(1); // up shape
    expect(clickAt(20, 115)).toBe(1); // hit shape, drawn nowhere
    expect(clickAt(120, 15)).toBe(0); // over shape while up is current
    expect(clickAt(120, 15, (b) => b._setState('over'))).toBe(1); // now the over shape is the current state
    expect(clickAt(20, 15, (b) => b._setState('over'))).toBe(0); // the up shape no longer counts
  });

  it('targets the button itself, not a shape or a state container', () => {
    const { player, btn } = build();
    const targets: unknown[] = [];
    btn.addEventListener(MouseEvent.MOUSE_DOWN, (e) => targets.push(e.target));
    player.root.addEventListener(MouseEvent.MOUSE_DOWN, (e) => targets.push(e.target));
    player.dispatchMouseDown(20, 15);
    expect(targets).toEqual([btn, btn]);
  });

  it('dispatches no mouse event to a disabled button or its parents', () => {
    const { player, btn } = build();
    btn.enabled = false;
    let seen = 0;
    btn.addEventListener(MouseEvent.CLICK, () => seen++);
    player.root.addEventListener(MouseEvent.CLICK, () => seen++);
    player.dispatchClick(20, 15);
    expect(seen).toBe(0);
  });

  it('hits through a rotated and scaled placement', () => {
    // Rotation 90 and scale 2 about (100, 100): the up shape (0..40, 0..30) maps to x 100-60..100, y 100..180.
    const { player, btn } = build([0, 2, -2, 0, 100, 100]);
    let clicks = 0;
    btn.addEventListener(MouseEvent.MOUSE_OVER, () => clicks++);
    player.dispatchMouseMove(70, 120); // inside the transformed up shape
    expect(clicks).toBe(1);
    player.dispatchMouseMove(20, 15); // inside the untransformed shape: now empty space
    expect(clicks).toBe(1);
  });
});
