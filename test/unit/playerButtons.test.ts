// The Player feeds pointer events into the button state model and dispatches click (robustness task 22.2).
// Validates: Requirements 20.4, 20.5, 20.6, 20.9, 20.10, 20.12, 20.15
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { ButtonSymbol, DisplayListEntry, SceneJson } from '../../template/runtime/scene';
import { MouseEvent } from '../../template/shim/events';
import type { SimpleButton } from '../../template/shim/SimpleButton';
import { FakeBackend } from '../support/fakeBackend';

const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
const entry = (symbolId: number): DisplayListEntry => ({ depth: 1, symbolId, matrix: [1, 0, 0, 1, 0, 0], colorTransform: ID_CT, name: '' });
const BUTTON: ButtonSymbol = { type: 'button', trackAsMenu: false, states: { up: [entry(1)], over: [entry(1)], down: [entry(1)], hit: [] } };

/** A 40 x 30 button at the origin inside the root; (10, 10) is on it, (200, 200) is not. */
function build() {
  const scene = {
    formatVersion: 4,
    stage: { width: 300, height: 300, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      '0': { type: 'sprite', frameCount: 1, frames: [[entry(2)]], labels: [] },
      '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 40, height: 30 } },
      '2': BUTTON,
    },
  } as unknown as SceneJson;
  const player = new Player({
    scene,
    backend: new FakeBackend(),
    clock: new ManualClock(),
    classRegistry: {},
    shapeBounds: new Map([[1, { x: 0, y: 0, width: 40, height: 30 }]]),
  });
  const btn = player.root.getChildAt(0) as SimpleButton;
  const clicks: string[] = [];
  btn.addEventListener(MouseEvent.CLICK, () => clicks.push('button'));
  player.root.addEventListener(MouseEvent.CLICK, () => clicks.push('parent'));
  return { player, btn, clicks };
}

describe('Player and buttons', () => {
  it('draws up at rest, over on hover, down on press, over again on release', () => {
    const { player, btn } = build();
    expect(btn._drawnState).toBe('up');
    player.dispatchMouseMove(10, 10);
    expect(btn._drawnState).toBe('over');
    player.dispatchMouseDown(10, 10);
    expect(btn._drawnState).toBe('down');
    player.dispatchMouseUp(10, 10);
    expect(btn._drawnState).toBe('over');
    player.dispatchMouseMove(200, 200);
    expect(btn._drawnState).toBe('up');
  });

  it('click on the same Pressed_Target reaches the button and bubbles to its parent', () => {
    const { player, clicks } = build();
    player.dispatchClick(10, 10);
    expect(clicks).toEqual(['button', 'parent']);
  });

  it('no click when the release is elsewhere; the button goes over on drag out, up on release outside', () => {
    const { player, btn, clicks } = build();
    player.dispatchMouseDown(10, 10);
    player.dispatchMouseMove(200, 200);
    expect(btn._drawnState).toBe('over');
    player.dispatchMouseUp(200, 200);
    expect(clicks).toEqual([]);
    expect(btn._drawnState).toBe('up');
  });

  it('dragging back onto the pressed button draws down again', () => {
    const { player, btn } = build();
    player.dispatchMouseDown(10, 10);
    player.dispatchMouseMove(200, 200);
    player.dispatchMouseMove(10, 10);
    expect(btn._drawnState).toBe('down');
  });

  it('a disabled button stays up, takes no click and keeps hiding what lies under it', () => {
    const { player, btn, clicks } = build();
    btn.enabled = false;
    player.dispatchMouseMove(10, 10);
    expect(btn._drawnState).toBe('up');
    player.dispatchClick(10, 10);
    expect(btn._drawnState).toBe('up');
    expect(clicks).toEqual([]);
  });

  it('buttonMode-style fields are stored only: useHandCursor changes nothing', () => {
    const { player, btn } = build();
    btn.useHandCursor = false;
    player.dispatchMouseMove(10, 10);
    expect(btn._drawnState).toBe('over');
  });
});
