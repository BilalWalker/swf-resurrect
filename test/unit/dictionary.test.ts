// Dictionary shim (as3-coverage task 14.1, Requirement 13.1, 13.3, 13.4). Fixture lines only.
// Validates: Requirements 13.1, 13.3, 13.4
import { describe, expect, it } from 'vitest';
import { Dictionary } from '../../template/shim/Dictionary';
import { takeNamedLimits } from '../../template/shim/errorSink';
import * as shim from '../../template/shim/index';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';

describe('Dictionary', () => {
  it('holds two entries for two different function keys', () => {
    const d = new Dictionary();
    const f = (): number => 1;
    const g = (): number => 1;
    d.set(f, 'f');
    d.set(g, 'g');
    expect(d.get(f)).toBe('f');
    expect(d.get(g)).toBe('g');
    expect(d.delete(f)).toBe(true);
    expect(d.has(f)).toBe(false);
    expect(d.has(g)).toBe(true);
  });

  it('keys objects by identity and strings and numbers by value', () => {
    const d = new Dictionary();
    const a = { id: 1 };
    d.set(a, 1);
    d.set({ id: 1 }, 2);
    d.set('k', 3);
    d.set(7, 4);
    expect(d.get(a)).toBe(1);
    expect(d.get('k' + '')).toBe(3);
    expect(d.get(3 + 4)).toBe(4);
    expect(d.has({ id: 1 })).toBe(false);
    expect(d.has('7')).toBe(false);
  });

  it('set returns the value', () => {
    expect(new Dictionary().set('a', 5)).toBe(5);
  });

  it('ignores weakKeys and records the Named_Limit once', () => {
    takeNamedLimits();
    const d = new Dictionary(true);
    new Dictionary(true);
    d.set('a', 1);
    expect(d.get('a')).toBe(1);
    expect(takeNamedLimits().map((l) => l.id)).toEqual(['dictionary-weakKeys-ignored']);
    new Dictionary();
    expect(takeNamedLimits()).toEqual([]);
  });

  it('is exported from the Shim index and listed as a Shim name', () => {
    expect(shim.Dictionary).toBe(Dictionary);
    expect(SHIM_AS3_NAMES.has('Dictionary')).toBe(true);
  });
});
