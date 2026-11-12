import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { Event, MouseEvent } from '../../template/shim/events';
import { attachRoot } from '../../template/shim/internal';
import { MovieClip } from '../../template/shim/MovieClip';
import { Sprite } from '../../template/shim/Sprite';
import { Stage } from '../../template/shim/Stage';
import { FakeBackend } from '../support/fakeBackend';

function tree() {
  const stage = new Stage();
  const root = new MovieClip();
  attachRoot(stage, root);
  root._isStageRoot = true;
  const child = new Sprite();
  root.addChild(child);
  return { stage, root, child };
}

describe('Stage_Object', () => {
  it('stage is null for a detached object and the Stage_Object for one on the stage', () => {
    const { stage, root, child } = tree();
    expect(new Sprite().stage).toBeNull();
    expect(child.stage).toBe(stage);
    expect(root.stage).toBe(stage);
  });

  it('root.parent is the Stage_Object, which is not the root', () => {
    const { stage, root } = tree();
    expect(root.parent).toBe(stage);
    expect(stage._children).toEqual([root]);
    expect(stage as unknown).not.toBe(root);
  });

  it('a bubbling click at a child reaches a Stage_Object listener in phase 3', () => {
    const { stage, child } = tree();
    const seen: Event[] = [];
    let current: unknown;
    stage.addEventListener(MouseEvent.CLICK, (e) => {
      seen.push(e);
      current = e.currentTarget;
      expect(e.eventPhase).toBe(3);
    });
    child.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
    expect(seen).toHaveLength(1);
    expect(current).toBe(stage);
    expect(seen[0]!.target).toBe(child);
  });

  it('an event dispatched at the Stage_Object does not reach the root', () => {
    const { stage, root } = tree();
    let hits = 0;
    root.addEventListener(MouseEvent.CLICK, () => hits++);
    stage.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
    expect(hits).toBe(0);
  });

  it('the Player owns the Stage_Object: readable in a root constructor, root.parent is it, it is not the root', () => {
    let inCtor: unknown = 'unset';
    let parentInCtor: unknown = 'unset';
    class Main extends MovieClip {
      constructor() {
        super();
        inCtor = this.stage;
        parentInCtor = this.parent;
      }
    }
    const rootSym: SpriteSymbol = { type: 'sprite', frameCount: 1, frames: [[]], labels: [], className: 'Main' };
    const scene: SceneJson = {
      formatVersion: 1,
      stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
      rootSymbolId: 0,
      symbols: { '0': rootSym },
    };
    const player = new Player({ scene, backend: new FakeBackend(), clock: new ManualClock(), classRegistry: { Main }, shapeBounds: new Map() });
    expect(inCtor).toBe(player.stage);
    expect(parentInCtor).toBe(player.stage);
    expect(player.root.parent).toBe(player.stage);
    expect(player.stage as unknown).not.toBe(player.root);
    expect(player.stage._children).toEqual([player.root]);
    expect(player.root.stage).toBe(player.stage);
  });
});
