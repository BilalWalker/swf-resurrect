// Graphics plan and its backend path (as3-coverage task 15.2). Fixture lines only; no sample is named.
// Validates: Requirements 14.5, 14.6, 14.7, 14.10, 14.13
import { describe, expect, it } from 'vitest';
import { planGraphics } from '../../template/runtime/graphicsPlan';
import { NodeRegistry } from '../../template/runtime/stageTree';
import { Graphics } from '../../template/shim/Graphics';
import { Sprite } from '../../template/shim/Sprite';
import { FakeBackend, type FakeNode } from '../support/fakeBackend';
const plan = (f: (g: Graphics) => void) => {
  const g = new Graphics();
  f(g);
  return planGraphics(g._prims);
};
describe('planGraphics', () => {
  it('draws a circle with the active fill and line', () => {
    expect(plan((g) => { g.lineStyle(2, 0xff); g.beginFill(0xff0000); g.drawCircle(5, 6, 7); g.endFill(); })).toEqual([
      { kind: 'circle', x: 5, y: 6, r: 7, fill: 0xff0000, stroke: { width: 2, color: 0xff } },
    ]);
  });
  it('keeps a stroke-only drawPath open and unfilled', () => {
    expect(plan((g) => { g.lineStyle(1, 0); g.drawPath([1, 2, 2], [0, 0, 4, 0, 4, 4]); })).toEqual([
      { kind: 'polyline', points: [[0, 0], [4, 0], [4, 4]], fill: null, stroke: { width: 1, color: 0 } },
    ]);
  });
  it('fills a shape whose endFill was never called', () => {
    expect(plan((g) => { g.beginFill(0x123456); g.moveTo(0, 0); g.lineTo(5, 0); g.lineTo(5, 5); })).toEqual([
      { kind: 'polyline', points: [[0, 0], [5, 0], [5, 5]], fill: 0x123456, stroke: null },
    ]);
  });
  it('draws nothing for a path with no line and no fill, or after clear', () => {
    expect(plan((g) => { g.moveTo(0, 0); g.lineTo(5, 5); })).toEqual([]);
    expect(plan((g) => { g.beginFill(1); g.drawCircle(0, 0, 1); g.clear(); })).toEqual([]);
  });
  it('continues from the pen after a line style change', () => {
    const ops = plan((g) => { g.lineStyle(1, 1); g.moveTo(0, 0); g.lineTo(2, 0); g.lineStyle(3, 2); g.lineTo(2, 2); });
    expect(ops.map((o) => o.kind === 'polyline' && o.points)).toEqual([[[0, 0], [2, 0]], [[2, 0], [2, 2]]]);
  });
});
describe('NodeRegistry pushes graphics', () => {
  it('pushes once per version, below children, and clears with null', () => {
    const backend = new FakeBackend();
    const reg = new NodeRegistry();
    const s = new Sprite();
    const node = backend.createContainer() as FakeNode;
    reg.register(s, node);
    reg.syncTree(backend, s);
    expect(node.graphics).toBeNull();
    s.graphics.beginFill(1);
    s.graphics.drawCircle(0, 0, 4);
    reg.syncTree(backend, s);
    const first = node.graphics;
    expect(first).toHaveLength(1);
    reg.syncTree(backend, s);
    expect(node.graphics).toBe(first);
    s.graphics.clear();
    reg.syncTree(backend, s);
    expect(node.graphics).toBeNull();
  });
});
