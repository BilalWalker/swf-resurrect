import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JobManager } from '../../web/server/jobs';
import { prewarm, prewarmVerdict } from '../../web/server/prewarm';
import type { PrewarmResult } from '../../web/server/prewarm';

const ok = (sample: string, cached = false): PrewarmResult => ({ sample, id: 'x', cached, status: 'succeeded', problem: null });

describe('prewarmVerdict', () => {
  it('passes when every sample succeeded', () => {
    expect(prewarmVerdict([ok('a', true), ok('b')])).toEqual({ code: 0, lines: ['prewarm ok: 2 sample(s) ready (1 already cached)'] });
  });

  it('fails loudly, naming each failed sample', () => {
    const v = prewarmVerdict([ok('a'), { sample: 'b', id: 'y', cached: false, status: 'failed', problem: 'verify: boom' }]);
    expect(v.code).toBe(1);
    expect(v.lines).toEqual(['prewarm FAILED: 1 of 2 sample(s) did not convert', '  b: verify: boom']);
  });

  it('fails when there are no samples', () => {
    expect(prewarmVerdict([]).code).toBe(1);
  });
});

describe('prewarm', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'swf-prewarm-'));
    for (const s of ['one', 'two']) {
      await mkdir(join(root, 'samples', s), { recursive: true });
      await writeFile(join(root, 'samples', s, 'test.swf'), Buffer.from(`FWS\x0a ${s}`));
    }
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('goes through submitSample for every sample and reports refusals instead of throwing', async () => {
    const jobs = new JobManager({
      repoRoot: root,
      runsDir: join(root, '.work', 'web-runs'),
      ffdecJar: join(root, 'missing.jar'),
      timeoutMs: 1000,
      buildPreview: () => Promise.resolve(),
    });
    await jobs.load();
    const lines: string[] = [];
    const results = await prewarm(jobs, { rerun: false, write: (l) => lines.push(l) });
    expect(results.map((r) => [r.sample, r.status])).toEqual([
      ['one', 'refused'],
      ['two', 'refused'],
    ]);
    expect(results[0].problem).toMatch(/FFDec jar was not found/);
    expect(lines[0]).toMatch(/^\[one\] refused: /);
    expect(prewarmVerdict(results).code).toBe(1);
    await jobs.stop();
  });
});
