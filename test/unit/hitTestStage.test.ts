// Hit test over Stage children (as3-coverage task 10.2).
// Validates: Requirements 7.6
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { resolveHitTarget, type TargetNode } from '../../template/runtime/hitTest';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { MouseEvent } from '../../template/shim/events';
import { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend } from '../support/fakeBackend';

const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
const shapeEntry = (tx: number): DisplayListEntry => ({ depth: 1, symbolId: 1, matrix: [1, 0, 0, 1, tx, 0], colorTransform: ID_CT, name: '' });
const spriteSym = (className?: string): SpriteSymbol => ({
  type: 'sprite',
  frameCount: 1,
  frames: [[shapeEntry(0)]],
  labels: [],
  ...(className === undefined ? {} : { className }),
});

class Hud extends MovieClip {}

/** A root with a 40 x 30 shape at the origin, and the linked symbol Hud with the same shape. */
function rig() {
  const scene: SceneJson = {
    formatVersion: 2,
    stage: { width: 200, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      '0': spriteSym(),
      '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 40, height: 30 } },
      '2': spriteSym('Hud'),
    },
  };
  const player = new Player({
    scene,
    backend: new FakeBackend(),
    clock: new ManualClock(),
    classRegistry: { Hud },
    shapeBounds: new Map([[1, { x: 0, y: 0, width: 40, height: 30 }]]),
  });
  const clicks: unknown[] = [];
  const watch = (o: { addEventListener: (t: string, l: (e: { target: unknown }) => void) => void }): void =>
    o.addEventListener(MouseEvent.CLICK, (e) => clicks.push(e.target));
  watch(player.stage);
  return { player, clicks, watch };
}

describe('Hit_Target over Stage children', () => {
  it('a Stage child above the root is the target where both are hit', () => {
    const { player, clicks } = rig();
    const hud = new Hud();
    hud.x = 20;
    player.stage.addChild(hud);
    player.dispatchClick(30, 10);
    expect(clicks).toEqual([hud]);
  });

  it('the root clip is never the target: a hit only on the root gives the Stage', () => {
    const { player, clicks } = rig();
    const hud = new Hud();
    hud.x = 20;
    player.stage.addChild(hud);
    player.dispatchClick(5, 10);
    expect(clicks).toEqual([player.stage]);
  });

  it('the topmost Stage child wins; the lower one is hit where the upper is not', () => {
    const { player, clicks } = rig();
    const low = new Hud();
    const high = new Hud();
    low.x = 0;
    high.x = 20;
    player.stage.addChild(low);
    player.stage.addChild(high);
    player.dispatchClick(30, 10);
    player.dispatchClick(5, 10);
    expect(clicks).toEqual([high, low]);
  });

  it('a Stage child with mouseEnabled false passes the hit on: the Stage is the target', () => {
    const { player, clicks } = rig();
    const hud = new Hud();
    hud.mouseEnabled = false;
    player.stage.addChild(hud);
    player.dispatchClick(5, 10);
    expect(clicks).toEqual([player.stage]);
  });

  it('a removed Stage child is no longer hit', () => {
    const { player, clicks } = rig();
    const hud = new Hud();
    player.stage.addChild(hud);
    player.stage.removeChild(hud);
    player.dispatchClick(5, 10);
    expect(clicks).toEqual([player.stage]);
  });
});

describe('resolveHitTarget with a rootClip argument', () => {
  const STAGE = { stage: true };
  interface N extends TargetNode<typeof STAGE> {
    parent: N | typeof STAGE;
  }
  const top: N = { parent: STAGE, isContainer: true, mouseEnabled: true, mouseChildren: true };
  const shape: N = { parent: top, isContainer: false, mouseEnabled: true, mouseChildren: true };

  it('without rootClip the topmost ancestor is excluded (old rule)', () => {
    expect(resolveHitTarget([shape], STAGE)).toBe(STAGE);
  });
  it('with another clip as rootClip the topmost ancestor is the target', () => {
    const other: N = { parent: STAGE, isContainer: true, mouseEnabled: true, mouseChildren: true };
    expect(resolveHitTarget([shape], STAGE, other)).toBe(top);
  });
  it('with the topmost ancestor as rootClip it is excluded', () => {
    expect(resolveHitTarget([shape], STAGE, top)).toBe(STAGE);
  });
});
