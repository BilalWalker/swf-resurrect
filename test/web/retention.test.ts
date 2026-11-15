import { describe, expect, it } from 'vitest';
import { planRetention } from '../../web/server/retention';
import type { RetentionEntry, RetentionPolicy } from '../../web/server/retention';

const H = 3600_000;
const NOW = 1_000 * H;
const policy: RetentionPolicy = { maxAgeMs: 24 * H, maxTotalBytes: 1000, maxJobs: 5, orphanGraceMs: H };

function e(id: string, hoursAgo: number, bytes = 10, extra: Partial<RetentionEntry> = {}): RetentionEntry {
  return { id, active: false, protected: false, orphan: false, lastUsedMs: NOW - hoursAgo * H, bytes, ...extra };
}

describe('planRetention', () => {
  it('keeps everything inside the limits', () => {
    expect(planRetention([e('a', 1), e('b', 2)], policy, NOW)).toEqual([]);
  });

  it('deletes finished jobs older than the age limit', () => {
    expect(planRetention([e('old', 25), e('new', 23)], policy, NOW)).toEqual([{ id: 'old', reason: 'age' }]);
  });

  it('never deletes active jobs or protected sample results, however old or large', () => {
    const entries = [e('run', 100, 5000, { active: true }), e('sample', 100, 5000, { protected: true })];
    expect(planRetention(entries, { ...policy, maxJobs: 1 }, NOW)).toEqual([]);
  });

  it('deletes orphans only after the grace period, and not for size or count before', () => {
    const entries = [e('o1', 2, 10, { orphan: true }), e('o2', 0.5, 5000, { orphan: true })];
    expect(planRetention(entries, policy, NOW)).toEqual([{ id: 'o1', reason: 'orphan' }]);
  });

  it('deletes oldest first until the total size fits', () => {
    const entries = [e('c', 1, 400), e('a', 3, 400), e('b', 2, 400), e('s', 10, 100, { protected: true })];
    // 1300 bytes; drop a (oldest deletable), then 900 fits.
    expect(planRetention(entries, policy, NOW)).toEqual([{ id: 'a', reason: 'size' }]);
  });

  it('deletes oldest first until the count fits, counting protected and active jobs', () => {
    const entries = [
      e('p', 9, 1, { protected: true }),
      e('r', 0, 1, { active: true }),
      e('j1', 5, 1),
      e('j2', 4, 1),
      e('j3', 3, 1),
      e('j4', 2, 1),
      e('j5', 1, 1),
    ];
    expect(planRetention(entries, policy, NOW)).toEqual([
      { id: 'j1', reason: 'count' },
      { id: 'j2', reason: 'count' },
    ]);
  });

  it('stops when only undeletable jobs are left', () => {
    const entries = [e('p', 1, 2000, { protected: true }), e('j', 2, 10)];
    expect(planRetention(entries, policy, NOW)).toEqual([{ id: 'j', reason: 'size' }]);
  });

  it('treats 0 as no limit', () => {
    const entries = [e('a', 1000, 1e9), e('b', 999, 1e9)];
    expect(planRetention(entries, { maxAgeMs: 0, maxTotalBytes: 0, maxJobs: 0, orphanGraceMs: H }, NOW)).toEqual([]);
  });

  it('is deterministic for equal times', () => {
    const entries = [e('b', 1, 600), e('a', 1, 600)];
    expect(planRetention(entries, policy, NOW)).toEqual([{ id: 'a', reason: 'size' }]);
  });
});
