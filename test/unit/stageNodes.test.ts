// Stage children nodes (as3-coverage task 9.3).
// Validates: Requirements 7.4
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson } from '../../template/runtime/scene';
import { Sprite } from '../../template/shim/Sprite';
import { FakeBackend, type FakeNode } from '../support/fakeBackend';

const scene: SceneJson = {
  formatVersion: 2,
  stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
  rootSymbolId: 0,
  symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]], labels: [] } },
};
function setup() {
  const backend = new FakeBackend();
  const clock = new ManualClock();
  const player = new Player({ scene, backend, clock, classRegistry: {}, shapeBounds: new Map() });
  const sync = (): void => {
    clock.advance(1);
    player.update();
  };
  return { backend, player, sync };
}

describe('Player.stageNode', () => {
  it('holds the root node first', () => {
    const { player } = setup();
    const stageNode = player.stageNode as FakeNode;
    expect(stageNode.children).toEqual([player.rootNode as FakeNode]);
  });
  it('draws a Stage child above the root and removes it with the child', () => {
    const { player, sync } = setup();
    const a = new Sprite();
    player.stage.addChild(a);
    sync();
    const stageNode = player.stageNode as FakeNode;
    expect(stageNode.children.length).toBe(2);
    expect(stageNode.children[0]).toBe(player.rootNode);
    player.stage.removeChild(a);
    sync();
    expect(stageNode.children).toEqual([player.rootNode as FakeNode]);
  });
  it('pushes a script-changed transform of a Stage child', () => {
    const { player, sync } = setup();
    const a = new Sprite();
    player.stage.addChild(a);
    a.x = 7;
    a.alpha = 0.5;
    sync();
    const node = (player.stageNode as FakeNode).children[1]!;
    expect(node.transform.x).toBe(7);
    expect(node.alpha).toBe(0.5);
  });
  it('follows the child order after a re-add', () => {
    const { player, sync } = setup();
    const a = new Sprite();
    const b = new Sprite();
    player.stage.addChild(a);
    player.stage.addChild(b);
    sync();
    player.stage.addChild(a);
    sync();
    const kids = (player.stageNode as FakeNode).children;
    expect(kids.length).toBe(3);
    expect(kids[0]).toBe(player.rootNode);
  });
});
