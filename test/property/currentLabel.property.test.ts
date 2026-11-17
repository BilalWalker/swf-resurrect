import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nearestLabel } from '../../template/shim/timelineLookup';
import { fcConfig } from './config';
// Feature: as3-coverage, Property 19: currentLabel is the nearest label
describe('Property 19: currentLabel is the nearest label', () => {
  const labelSets = fc
    .uniqueArray(fc.integer({ min: 1, max: 60 }), { maxLength: 10 })
    .map((fs) => fs.sort((a, b) => a - b).map((frame, i) => ({ name: `L${i}`, frame })));
  it('equals the label with the largest frame at or before currentFrame, else null', () => {
    fc.assert(
      fc.property(labelSets, fc.integer({ min: 1, max: 60 }), (labels, frame) => {
        const before = labels.filter((l) => l.frame <= frame);
        const expected = before.length === 0 ? null : before[before.length - 1].name;
        expect(nearestLabel(labels, frame)).toBe(expected);
      }),
      fcConfig,
    );
  });
});
