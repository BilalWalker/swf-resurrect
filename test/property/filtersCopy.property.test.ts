// Feature: as3-coverage, Property 17: filters are copied
// Validates: Requirements 16.1, 16.4, 16.5
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { GlowFilter } from '../../template/shim/GlowFilter';
import { Sprite } from '../../template/shim/Sprite';
import { fcConfig } from './config';
describe('Property 17: filters are copied', () => {
  it('the getter returns an equal array that is not the same, and editing it changes nothing stored', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 0xffffff }), fc.double({ min: 0, max: 1, noNaN: true }))), (specs) => {
        const input = specs.map(([c, a]) => new GlowFilter(c, a));
        const s = new Sprite();
        s.filters = input;
        const got = s.filters;
        expect(got).toEqual(input);
        expect(got).not.toBe(input);
        got.push(new GlowFilter());
        got.length = 0;
        expect(s.filters).toEqual(input);
        input.length = 0;
        expect(s.filters.length).toBe(specs.length);
      }),
      fcConfig,
    );
  });
});