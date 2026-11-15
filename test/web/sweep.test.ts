// JobManager.sweep on a real directory tree: persisted jobs, an orphan directory and a bundled
// sample's cached result. No pipeline runs.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initialState } from '../../web/server/jobState';
import { JobManager } from '../../web/server/jobs';
import { cacheKey } from '../../web/server/upload';

const H = 3600_000;
const NOW = Date.UTC(2026, 10, 14, 12);
const SAMPLE_SWF = Buffer.from('FWS\x0a sample bytes for the sweep test');

let root: string;
let runsDir: string;

async function persistJob(
  id: string,
  o: { sample: string | null; sha256: string; finishedHoursAgo: number; status?: 'succeeded' | 'failed'; bytes?: number },
): Promise<void> {
  const dir = join(runsDir, id);
  await mkdir(join(dir, 'out'), { recursive: true });
  await writeFile(join(dir, 'out', 'blob.bin'), Buffer.alloc(o.bytes ?? 100));
  const finished = new Date(NOW - o.finishedHoursAgo * H).toISOString();
  await writeFile(
    join(dir, 'job.json'),
    JSON.stringify({
      formatVersion: 1,
      id,
      name: o.sample === null ? 'upload.swf' : `${o.sample}.swf`,
      source: o.sample === null ? 'upload' : 'sample',
      sample: o.sample,
      sha256: o.sha256,
      swfPath: join(dir, 'input', 'upload.swf'),
      state: { ...initialState(), status: o.status ?? 'succeeded' },
      log: [],
      createdAt: finished,
      startedAt: finished,
      finishedAt: finished,
    }),
  );
}

function manager(policy: { maxAgeMs: number; maxTotalBytes: number; maxJobs: number }): JobManager {
  return new JobManager({
    repoRoot: root,
    runsDir,
    ffdecJar: join(root, 'missing.jar'),
    timeoutMs: 1000,
    buildPreview: () => Promise.resolve(),
    retention: { ...policy, orphanGraceMs: H },
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'swf-sweep-'));
  runsDir = join(root, '.work', 'web-runs');
  await mkdir(join(root, 'samples', 'demo'), { recursive: true });
  await writeFile(join(root, 'samples', 'demo', 'test.swf'), SAMPLE_SWF);
  await mkdir(runsDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('JobManager.sweep', () => {
  it('deletes old uploads, superseded sample runs and stale orphans; keeps the sample cache', async () => {
    const sampleSha = cacheKey(SAMPLE_SWF);
    await persistJob('aaaaaaaaaaaaaaaaaaaaaaaa', { sample: 'demo', sha256: sampleSha, finishedHoursAgo: 500 }); // cached sample
    await persistJob('bbbbbbbbbbbbbbbbbbbbbbbb', { sample: 'demo', sha256: sampleSha, finishedHoursAgo: 600 }); // superseded
    await persistJob('cccccccccccccccccccccccc', { sample: null, sha256: 'c'.repeat(64), finishedHoursAgo: 100 }); // old upload
    await persistJob('dddddddddddddddddddddddd', { sample: null, sha256: 'd'.repeat(64), finishedHoursAgo: 1 }); // recent upload
    const orphan = join(runsDir, 'eeeeeeeeeeeeeeeeeeeeeeee');
    await mkdir(orphan);
    const old = new Date(NOW - 5 * H);
    await utimes(orphan, old, old);
    const fresh = join(runsDir, 'ffffffffffffffffffffffff');
    await mkdir(fresh); // orphan inside its grace period
    const recent = new Date(NOW - 0.5 * H);
    await utimes(fresh, recent, recent);
    await mkdir(join(runsDir, 'not-a-job-dir'));

    const jobs = manager({ maxAgeMs: 72 * H, maxTotalBytes: 0, maxJobs: 0 });
    await jobs.load();
    const deleted = await jobs.sweep(NOW);

    expect(deleted.map((d) => `${d.id[0]}:${d.reason}`).sort()).toEqual(['b:age', 'c:age', 'e:orphan']);
    expect(existsSync(join(runsDir, 'aaaaaaaaaaaaaaaaaaaaaaaa'))).toBe(true);
    expect(existsSync(join(runsDir, 'bbbbbbbbbbbbbbbbbbbbbbbb'))).toBe(false);
    expect(existsSync(join(runsDir, 'cccccccccccccccccccccccc'))).toBe(false);
    expect(existsSync(join(runsDir, 'dddddddddddddddddddddddd'))).toBe(true);
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(join(runsDir, 'not-a-job-dir'))).toBe(true);
    expect(jobs.get('cccccccccccccccccccccccc')).toBeUndefined();
    expect((await jobs.listSamples())[0].cachedJobId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    await jobs.stop();
  });

  it('enforces the count limit oldest first', async () => {
    for (let i = 0; i < 5; i++) {
      await persistJob(String(i).repeat(24), { sample: null, sha256: String(i).repeat(64), finishedHoursAgo: 10 - i });
    }
    const jobs = manager({ maxAgeMs: 0, maxTotalBytes: 0, maxJobs: 3 });
    await jobs.load();
    expect((await jobs.sweep(NOW)).map((d) => d.id)).toEqual(['0'.repeat(24), '1'.repeat(24)]);
    await jobs.stop();
  });

  it('does nothing without a policy', async () => {
    await persistJob('cccccccccccccccccccccccc', { sample: null, sha256: 'c'.repeat(64), finishedHoursAgo: 10_000 });
    const jobs = new JobManager({ repoRoot: root, runsDir, ffdecJar: 'x', timeoutMs: 1000, buildPreview: () => Promise.resolve() });
    await jobs.load();
    expect(await jobs.sweep(NOW)).toEqual([]);
    expect(existsSync(join(runsDir, 'cccccccccccccccccccccccc'))).toBe(true);
  });
});
