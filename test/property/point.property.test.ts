// Properties 21 and 22 of the robustness design (task 15.2).
// The model is the Ruffle formulas recorded in .kiro/steering/flash-behaviour.md ("Point").
// Exact equality for add/subtract and for interpolate at f = 1 only holds when no rounding happens, so those
// cases use dyadic rationals (k / 1024, |k| <= 2^30): every sum, difference and product below stays exact.
// Distance symmetry and f = 0 hold exactly for any finite doubles. The segment and normalize checks use
// bounded doubles and a relative tolerance.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Point } from '../../template/shim/index';
import { fcConfig } from './config';

const dyadic = fc.integer({ min: -(2 ** 30), max: 2 ** 30 }).map((k) => k / 1024);
const dyadicPoint = fc.record({ x: dyadic, y: dyadic }).map((r) => new Point(r.x, r.y));
const bounded = fc.double({ min: -1e6, max: 1e6, noNaN: true });
const boundedPoint = fc.record({ x: bounded, y: bounded }).map((r) => new Point(r.x, r.y));
const weight = fc.double({ min: 0, max: 1, noNaN: true });

describe('Property 21: Point algebra', () => {
  /** **Validates: Requirements 18.1, 18.4, 18.7, 18.8** */
  it('a.add(b).subtract(b) equals a (dyadic values, exact)', () => {
    fc.assert(
      fc.property(dyadicPoint, dyadicPoint, (a, b) => {
        expect(a.add(b).subtract(b).equals(a)).toBe(true);
      }),
      fcConfig,
    );
  });

  it('distance is symmetric and matches the sqrt model', () => {
    fc.assert(
      fc.property(boundedPoint, boundedPoint, (a, b) => {
        expect(Point.distance(a, b)).toBe(Point.distance(b, a));
        expect(Point.distance(a, b)).toBe(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2));
      }),
      fcConfig,
    );
  });

  it('interpolate follows the model, stays on the segment, f = 0 gives b, f = 1 gives a', () => {
    fc.assert(
      fc.property(boundedPoint, boundedPoint, weight, (a, b, f) => {
        const p = Point.interpolate(a, b, f);
        expect(p.x).toBe(b.x - (b.x - a.x) * f);
        expect(p.y).toBe(b.y - (b.y - a.y) * f);
        const tol = 1e-9 * (Math.abs(a.x) + Math.abs(a.y) + Math.abs(b.x) + Math.abs(b.y) + 1);
        // on the segment: p = a + (1 - f) * (b - a) within rounding
        expect(Math.abs(p.x - (a.x + (b.x - a.x) * (1 - f)))).toBeLessThanOrEqual(tol);
        expect(Math.abs(p.y - (a.y + (b.y - a.y) * (1 - f)))).toBeLessThanOrEqual(tol);
        expect(p.x).toBeGreaterThanOrEqual(Math.min(a.x, b.x) - tol);
        expect(p.x).toBeLessThanOrEqual(Math.max(a.x, b.x) + tol);
        expect(p.y).toBeGreaterThanOrEqual(Math.min(a.y, b.y) - tol);
        expect(p.y).toBeLessThanOrEqual(Math.max(a.y, b.y) + tol);
        expect(Point.interpolate(a, b, 0).equals(b)).toBe(true);
      }),
      fcConfig,
    );
  });

  it('interpolate at f = 1 gives a (dyadic values, exact)', () => {
    fc.assert(
      fc.property(dyadicPoint, dyadicPoint, (a, b) => {
        expect(Point.interpolate(a, b, 1).equals(a)).toBe(true);
      }),
      fcConfig,
    );
  });
});

describe('Property 22: Point.normalize', () => {
  /** **Validates: Requirements 18.1, 18.2, 18.3, 18.9** */
  it('the length after normalize(t) equals t within 1e-9 relative error', () => {
    // Length bounded below so squaring does not underflow.
    const nonOrigin = boundedPoint.filter((p) => p.length >= 1e-3);
    fc.assert(
      fc.property(nonOrigin, fc.double({ min: 1e-3, max: 1e6, noNaN: true }), (p, t) => {
        p.normalize(t);
        expect(Math.abs(p.length - t) / t).toBeLessThanOrEqual(1e-9);
      }),
      fcConfig,
    );
  });

  it('the origin is unchanged', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (t) => {
        const p = new Point(0, 0);
        p.normalize(t);
        expect(p.x).toBe(0);
        expect(p.y).toBe(0);
      }),
      fcConfig,
    );
  });
});
