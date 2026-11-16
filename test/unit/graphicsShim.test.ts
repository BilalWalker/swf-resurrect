// Graphics shim recording (as3-coverage task 15.1). Fixture lines only; no sample is named.
// Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.9, 14.12
import { describe, expect, it } from 'vitest';
import { takeNamedLimits } from '../../template/shim/errorSink';
import { Graphics, GraphicsPathWinding } from '../../template/shim/Graphics';
import * as shim from '../../template/shim/index';
import { Shape } from '../../template/shim/Shape';
import { Sprite } from '../../template/shim/Sprite';
describe('Graphics shim', () => {
  it('Sprite and Shape each return one Graphics, the same one every time', () => {
    const s = new Sprite();
    const h = new Shape();
    expect(s.graphics).toBeInstanceOf(Graphics);
    expect(s.graphics).toBe(s.graphics);
    expect(h.graphics).toBe(h.graphics);
    expect(shim.Graphics).toBe(Graphics);
  });
  it('exports GraphicsPathWinding with the two strings', () => {
    expect(GraphicsPathWinding.NON_ZERO).toBe('nonZero');
    expect(GraphicsPathWinding.EVEN_ODD).toBe('evenOdd');
  });
  it('records each call and counts a version per call', () => {
    const g = new Graphics();
    g.lineStyle(2, 0xff0000);
    g.beginFill(0x00ff00);
    g.drawCircle(1, 2, 3);
    g.moveTo(4, 5);
    g.lineTo(6, 7);
    g.endFill();
    expect(g._prims).toEqual([
      { k: 'lineStyle', width: 2, color: 0xff0000 },
      { k: 'beginFill', color: 0x00ff00 },
      { k: 'circle', x: 1, y: 2, r: 3 },
      { k: 'moveTo', x: 4, y: 5 },
      { k: 'lineTo', x: 6, y: 7 },
      { k: 'endFill' },
    ]);
    expect(g.version).toBe(6);
  });
  it('expands drawPath: command 1 is moveTo, 2 is lineTo, two values each', () => {
    const g = new Graphics();
    g.drawPath([1, 2, 2], [0, 0, 10, 0, 10, 10], GraphicsPathWinding.NON_ZERO);
    expect(g._prims).toEqual([
      { k: 'moveTo', x: 0, y: 0 },
      { k: 'lineTo', x: 10, y: 0 },
      { k: 'lineTo', x: 10, y: 10 },
    ]);
  });
  it('skips an unknown command with its data and records the limit once', () => {
    takeNamedLimits();
    const g = new Graphics();
    g.drawPath([1, 3, 2, 3], [0, 0, 9, 9, 5, 5, 8, 8]);
    expect(g._prims).toEqual([
      { k: 'moveTo', x: 0, y: 0 },
      { k: 'lineTo', x: 5, y: 5 },
    ]);
    expect(takeNamedLimits().map((l) => l.id)).toEqual(['drawPath-command']);
  });
  it('ignores lineStyle arguments after the colour with a limit', () => {
    takeNamedLimits();
    const g = new Graphics();
    (g.lineStyle as (...a: unknown[]) => void)(1, 0, 0.5, true);
    expect(g._prims).toEqual([{ k: 'lineStyle', width: 1, color: 0 }]);
    expect(takeNamedLimits().map((l) => l.id)).toEqual(['lineStyle-args']);
  });
  it('clear() discards every recorded command', () => {
    const g = new Graphics();
    g.beginFill(1);
    g.drawCircle(0, 0, 1);
    g.clear();
    expect(g._prims).toEqual([]);
    expect(g.version).toBe(3);
  });
});
