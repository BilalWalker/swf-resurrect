import { describe, expect, it } from 'vitest';
import { hitTestAll, resolveHitTarget, type HitNode, type TargetNode } from '../../template/runtime/hitTest';

const STAGE = { stage: true };

interface N extends TargetNode<typeof STAGE> {
  parent: N | typeof STAGE;
  mouseEnabled: boolean;
  mouseChildren: boolean;
  name: string;
}
function node(name: string, parent: N | typeof STAGE, isContainer: boolean, flags: Partial<Pick<N, 'mouseEnabled' | 'mouseChildren'>> = {}): N {
  return { name, parent, isContainer, mouseEnabled: true, mouseChildren: true, ...flags };
}

describe('hitTestAll', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };
  const shape = (x = 0, visible = true): HitNode => ({ x, y: 0, scaleX: 1, scaleY: 1, rotation: 0, visible, bounds: box });
  const group = (children: HitNode[]): HitNode => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, visible: true, children });

  it('returns every shape under the point, topmost first, and the first one is what hitTest returns', () => {
    const low = shape();
    const high = shape();
    const away = shape(50);
    expect(hitTestAll(group([low, away, high]), 5, 5)).toEqual([high, low]);
  });
  it('skips invisible nodes and subtrees, and returns an empty list when nothing is hit', () => {
    expect(hitTestAll(group([shape(0, false)]), 5, 5)).toEqual([]);
    expect(hitTestAll(group([group([shape()])]), 50, 50)).toEqual([]);
  });
});

describe('resolveHitTarget', () => {
  it('gives the Stage_Object when nothing is hit', () => {
    expect(resolveHitTarget([], STAGE)).toBe(STAGE);
  });

  it('a shape of a nested clip gives that clip', () => {
    const root = node('root', STAGE, true);
    const btn = node('btn', root, true);
    const s = node('s', btn, false);
    expect(resolveHitTarget([s], STAGE)).toBe(btn);
  });

  it('mouseChildren = false on a button-like clip makes the clip the target for a hit on an inner clip', () => {
    const root = node('root', STAGE, true);
    const btn = node('btn', root, true, { mouseChildren: false });
    const inner = node('inner', btn, true);
    const s = node('s', inner, false);
    expect(resolveHitTarget([s], STAGE)).toBe(btn);
  });

  it('mouseEnabled = false skips the object: the parent receives the event', () => {
    const root = node('root', STAGE, true);
    const group = node('group', root, true);
    const off = node('off', group, true, { mouseEnabled: false });
    const s = node('s', off, false);
    expect(resolveHitTarget([s], STAGE)).toBe(group);
  });

  it('a disabled object above a directly hit sibling does not hide the sibling', () => {
    const root = node('root', STAGE, true);
    const below = node('below', root, true);
    const above = node('above', root, true, { mouseEnabled: false });
    const sBelow = node('sBelow', below, false);
    const sAbove = node('sAbove', above, false);
    // topmost first: the disabled clip's shape, then the sibling's shape
    expect(resolveHitTarget([sAbove, sBelow], STAGE)).toBe(below);
  });

  it('a disabled object whose only hit propagates is absorbed by the nearest enabled ancestor, or gives the stage', () => {
    const root = node('root', STAGE, true);
    const outer = node('outer', root, true);
    const off = node('off', outer, true, { mouseEnabled: false });
    expect(resolveHitTarget([node('s', off, false)], STAGE)).toBe(outer);
    outer.mouseEnabled = false;
    expect(resolveHitTarget([node('s', off, false)], STAGE)).toBe(STAGE);
  });

  it('an interactive clip below non-interactive root shapes is picked (click_block shape)', () => {
    const root = node('root', STAGE, true);
    const clip = node('click_mc', root, true);
    const inClip = node('inClip', clip, false);
    const rootShape5 = node('shape5', root, false);
    const rootShape6 = node('shape6', root, false);
    // topmost first: shapes at depth 6 and 5 above the clip at depth 1
    expect(resolveHitTarget([rootShape6, rootShape5, inClip], STAGE)).toBe(clip);
  });

  it('a point that only a root-clip shape contains gives the Stage_Object (the root is never a target)', () => {
    const root = node('root', STAGE, true);
    expect(resolveHitTarget([node('s', root, false)], STAGE)).toBe(STAGE);
  });

  it('a clip that is above another keeps winning inside the interactive group', () => {
    const root = node('root', STAGE, true);
    const low = node('low', root, true);
    const high = node('high', root, true);
    expect(resolveHitTarget([node('a', high, false), node('b', low, false)], STAGE)).toBe(high);
  });
});
