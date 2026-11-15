// Retention of job directories under .work/web-runs. Pure: decides which directories to delete;
// the IO (listing, sizing, deleting) lives in JobManager.sweep.
//
// Never deleted: a job that is queued or running, and the current cached result of a bundled
// sample (so the gallery keeps opening at once). Everything else is a candidate: finished
// uploads, superseded sample runs, and orphan directories left by a server that stopped mid-run.

export interface RetentionPolicy {
  /** Finished jobs older than this are deleted. 0: no age limit. */
  maxAgeMs: number;
  /** Total size of all job directories. 0: no size limit. */
  maxTotalBytes: number;
  /** Number of job directories. 0: no count limit. */
  maxJobs: number;
  /** Directories the manager does not know are left alone this long (another process may be writing). */
  orphanGraceMs: number;
}

export interface RetentionEntry {
  id: string;
  /** Queued or running: never deleted. */
  active: boolean;
  /** The cached result of a bundled sample: never deleted. */
  protected: boolean;
  /** Not a job the manager knows (no readable job.json and not in memory). */
  orphan: boolean;
  /** Last activity: finish time, else creation time, else directory mtime (ms since epoch). */
  lastUsedMs: number;
  bytes: number;
}

export type RetentionReason = 'age' | 'orphan' | 'size' | 'count';

export interface RetentionDecision {
  id: string;
  reason: RetentionReason;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  maxAgeMs: 3 * 24 * 3600_000,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  maxJobs: 100,
  orphanGraceMs: 3600_000,
};

/** Which job directories to delete now, oldest first within each reason. */
export function planRetention(entries: readonly RetentionEntry[], policy: RetentionPolicy, nowMs: number): RetentionDecision[] {
  const out: RetentionDecision[] = [];
  const kept: RetentionEntry[] = [];
  const byAge = [...entries].sort((a, b) => a.lastUsedMs - b.lastUsedMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const e of byAge) {
    const deletable = !e.active && !e.protected;
    const age = nowMs - e.lastUsedMs;
    if (deletable && e.orphan && age > policy.orphanGraceMs) out.push({ id: e.id, reason: 'orphan' });
    else if (deletable && !e.orphan && policy.maxAgeMs > 0 && age > policy.maxAgeMs) out.push({ id: e.id, reason: 'age' });
    else kept.push(e);
  }
  let total = kept.reduce((s, e) => s + e.bytes, 0);
  let count = kept.length;
  // Oldest first; orphans still inside their grace period are not candidates for size or count.
  for (const e of kept) {
    if (e.active || e.protected || e.orphan) continue;
    const overSize = policy.maxTotalBytes > 0 && total > policy.maxTotalBytes;
    const overCount = policy.maxJobs > 0 && count > policy.maxJobs;
    if (!overSize && !overCount) break;
    out.push({ id: e.id, reason: overSize ? 'size' : 'count' });
    total -= e.bytes;
    count -= 1;
  }
  return out;
}
