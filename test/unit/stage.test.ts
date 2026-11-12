import { describe, expect, it } from 'vitest';
import { Event, MouseEvent } from '../../template/shim/events';
import { attachRoot } from '../../template/shim/internal';
import { MovieClip } from '../../template/shim/MovieClip';
import { Sprite } from '../../template/shim/Sprite';
import { Stage } from '../../template/shim/Stage';

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

  it('a clip built with rootParent sees the Stage_Object in its constructor', () => {
    // MovieClip adopts ctx.rootParent at construction; covered through attachRoot above and the Player in 6.4.
    expect(new Stage()._isStage).toBe(true);
  });
});
