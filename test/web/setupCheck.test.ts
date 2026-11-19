// While setup is not ready, repeated checks reuse the Java probe for a while instead of running
// `java -version` (synchronous, blocking) on every request. Named cause of the publicHost.e2e flake.
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const javaAvailable = vi.fn(() => true);
vi.mock('../../web/server/processTree', async (orig) => ({ ...(await orig<object>()), javaAvailable }));

const { JAVA_RECHECK_MS, JobManager } = await import('../../web/server/jobs');

afterEach(() => {
  vi.useRealTimers();
  javaAvailable.mockClear();
});

describe('setup check', () => {
  it('probes Java once per recheck interval while the jar is missing', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const jobs = new JobManager({ repoRoot: 'r', runsDir: 'r', ffdecJar: join('no', 'such.jar'), timeoutMs: 1000, buildPreview: () => Promise.resolve() });
    for (let i = 0; i < 5; i++) expect(jobs.setupStatus().ready).toBe(false);
    expect(javaAvailable).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1_000_000 + JAVA_RECHECK_MS);
    jobs.setupStatus();
    expect(javaAvailable).toHaveBeenCalledTimes(2);
  });
});
