// DisplayObject.filters and GlowFilter (as3-coverage task 16.3). Validates: Requirements 16.1 to 16.4
import { describe, expect, it } from 'vitest';
import { takeNamedLimits } from '../../template/shim/errorSink';
import { GlowFilter } from '../../template/shim/GlowFilter';
import { Sprite } from '../../template/shim/Sprite';
describe('filters', () => {
  it('GlowFilter stores its five values under their names', () => {
    const g = new GlowFilter(0x00ff00, 0.5, 4, 8, 3);
    expect([g.color, g.alpha, g.blurX, g.blurY, g.strength]).toEqual([0x00ff00, 0.5, 4, 8, 3]);
    g.strength = 9;
    expect(g.strength).toBe(9);
  });
  it('the setter and the getter copy', () => {
    const s = new Sprite();
    const f = new GlowFilter();
    const list = [f];
    s.filters = list;
    list.push(new GlowFilter());
    expect(s.filters).toEqual([f]);
    s.filters.pop();
    expect(s.filters).toEqual([f]);
    expect(s.filters).not.toBe(s.filters);
  });
  it('a non-empty list names the filter class as not drawn, an empty one does not', () => {
    takeNamedLimits();
    const s = new Sprite();
    s.filters = [];
    expect(takeNamedLimits()).toEqual([]);
    s.filters = [new GlowFilter()];
    expect(takeNamedLimits().map((l) => l.id)).toEqual(['filter-not-drawn:GlowFilter']);
  });
});