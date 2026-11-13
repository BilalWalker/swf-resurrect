import { describe, expect, it } from 'vitest';
import { compareTraces } from '../../src/verify/core/traceCompare';

describe('compareTraces with an empty side (task 7.9)', () => {
  it('two empty traces still score 100', () => {
    expect(compareTraces([], [])).toMatchObject({ kind: 'compared', traceScore: 100 });
  });
  it('an empty reference with one captured line scores 0 with one extra', () => {
    const r = compareTraces([], ['x']);
    expect(r).toMatchObject({ kind: 'compared', traceScore: 0 });
    if (r.kind === 'compared') expect(r.extra).toHaveLength(1);
  });
  it('the three Error #2012 lines against an empty capture are three missing entries', () => {
    const ref = [
      'Caught error: ArgumentError: Error #2012: StaticText$ class cannot be instantiated.',
      'e.errorID: 2012',
      'Child: [object StaticText]',
    ];
    const r = compareTraces(ref, []);
    expect(r.kind).toBe('compared');
    if (r.kind === 'compared') {
      expect(r.missing.map((m) => m.text)).toEqual(ref);
      expect(r.traceScore).toBe(0);
    }
  });
});
