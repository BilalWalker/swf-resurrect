// End to end: one web job per Outcome class, through the real pipeline CLI. The hostile files come
// from the engine's generators (test/support/hostileSwf.ts); nothing is downloaded. Needs Java and
// the FFDec jar, like server.e2e.test.ts, and skips with the reason when either is missing.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JobSummary } from '../../web/shared/api';
import { REPO_ROOT, startServer } from '../../web/server/main';
import type { RunningServer } from '../../web/server/main';
import { TAG, buildSwf, cut, tag } from '../support/hostileSwf';
import { rawRequest, testServerOptions } from './helpers';

const jar = process.env.SWF_RESURRECT_FFDEC || join(REPO_ROOT, 'tools', 'ffdec', 'ffdec-cli.jar');
const javaOk = ((): boolean => {
  try {
    return spawnSync('java', ['-version'], { stdio: 'ignore', timeout: 15_000 }).status === 0;
  } catch {
    return false;
  }
})();
const skipReason = !javaOk ? 'Java is not on the PATH' : !existsSync(jar) ? `FFDec jar not found at ${jar} (set SWF_RESURRECT_FFDEC)` : null;
if (skipReason !== null) console.warn(`web outcome e2e skipped: ${skipReason}`);

let server: RunningServer;
let runsDir: string;

beforeAll(async () => {
  runsDir = resolve(REPO_ROOT, '.work', `test-web-outcomes-${process.pid}`);
  await mkdir(runsDir, { recursive: true });
  server = await startServer(testServerOptions({ timeoutMs: 240_000, ffdecJar: jar }), { runsDir });
});

afterAll(async () => {
  await server?.close();
  await rm(runsDir, { recursive: true, force: true });
});

async function upload(bytes: Uint8Array, name: string, s: RunningServer = server): Promise<JobSummary> {
  const { id } = await s.jobs.submitUpload(Buffer.from(bytes), name, true);
  const done = await s.jobs.whenSettled(id);
  if (done === undefined) throw new Error('job vanished');
  return done;
}

async function sample(name: string): Promise<JobSummary> {
  const { id } = await server.jobs.submitSample(name, true);
  const done = await server.jobs.whenSettled(id);
  if (done === undefined) throw new Error('job vanished');
  return done;
}

const get = (path: string, s: RunningServer = server) => rawRequest(s.port, 'GET', path);

describe.skipIf(skipReason !== null)('web jobs per Outcome', () => {
  it('converted: a sample with no gap', { timeout: 240_000 }, async () => {
    const j = await sample('gradients');
    expect(j.status, JSON.stringify(j.error)).toBe('succeeded');
    expect(j.outcome).toMatchObject({ outcome: 'converted', reasonCode: null, referenceId: null });
    expect(j.outcome?.numbers).not.toBeNull();
    expect(j.artifacts.project).toBe(true);
    expect((await get(`/api/jobs/${j.id}/swf`)).status).toBe(200);
  });

  it('converted-with-gaps: a sample with type errors', { timeout: 240_000 }, async () => {
    const j = await sample('mask_reapply');
    expect(j.status, JSON.stringify(j.error)).toBe('succeeded');
    expect(j.outcome?.outcome).toBe('converted-with-gaps');
    expect(j.outcome?.gaps.some((g) => g.kind === 'type-error' && g.count > 0)).toBe(true);
    expect(j.outcome?.numbers?.typeErrors).toBeGreaterThan(0);
  });

  it('refused actionscript-1-2: own state, no project, the original still playable', { timeout: 120_000 }, async () => {
    const j = await upload(buildSwf({ tags: [tag(TAG.DoAction, [0])] }), 'old.swf');
    expect(j.status).toBe('refused');
    expect(j.error).toBeNull();
    expect(j.outcome).toMatchObject({ outcome: 'refused', reasonCode: 'actionscript-1-2', numbers: null });
    expect(j.outcome?.reason).toBe('the file uses ActionScript 1 or 2, which is not supported');
    expect(j.artifacts).toMatchObject({ app: false, project: false });
    expect((await get(`/api/jobs/${j.id}/project.zip`)).status).toBe(404);
    expect((await get(`/api/jobs/${j.id}/swf`)).status).toBe(200);
    // Only outcome.json and logs stay in the output folder.
    const left = await readdir(join(runsDir, j.id, 'out')).catch(() => []);
    expect(left).toContain('outcome.json');
    expect(left).not.toContain('package.json');
  });

  it('refused damaged and not-swf', { timeout: 120_000 }, async () => {
    const damaged = await upload(cut(buildSwf({ tags: [tag(TAG.FileAttributes, [8, 0, 0, 0])] }), 12), 'cut.swf');
    expect(damaged.status).toBe('refused');
    expect(damaged.outcome?.reasonCode).toBe('damaged');
    // The HTTP route refuses non-SWF bytes with 415; the manager is called directly to reach the engine.
    const text = await upload(new TextEncoder().encode('this is a plain text file, not a movie'), 'text.swf');
    expect(text.status).toBe('refused');
    expect(text.outcome?.reasonCode).toBe('not-swf');
  });

  it('refused time-limit: the engine sentence, not a server kill', { timeout: 120_000 }, async () => {
    const dir = resolve(REPO_ROOT, '.work', `test-web-limit-${process.pid}`);
    await mkdir(dir, { recursive: true });
    const tight = await startServer(testServerOptions({ timeoutMs: 1000, ffdecJar: jar }), { runsDir: dir });
    try {
      const { id } = await tight.jobs.submitSample('tweendemo', true);
      const j = await tight.jobs.whenSettled(id);
      expect(j?.status, JSON.stringify(j?.error)).toBe('refused');
      expect(j?.outcome).toMatchObject({ outcome: 'refused', reasonCode: 'time-limit', runLimitS: 1 });
      expect(j?.outcome?.reason).toMatch(/time limit|limit/);
    } finally {
      await tight.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('failed: Java gone after start-up gives internal-error with a reference id', { timeout: 120_000 }, async () => {
    // The setup check already found Java; the pipeline child inherits this PATH and cannot start FFDec.
    const saved = process.env.PATH;
    process.env.PATH = resolve(runsDir, 'no-such-dir');
    let j: JobSummary;
    try {
      j = await sample('tweendemo');
    } finally {
      process.env.PATH = saved;
    }
    expect(j.status).toBe('failed');
    expect(j.outcome).toMatchObject({ outcome: 'failed', reasonCode: 'internal-error' });
    expect(j.outcome?.referenceId).toMatch(/^[0-9a-f]{8}$/);
    expect(j.error?.message).toBe(j.outcome?.reason);
    expect(j.error?.message).not.toMatch(/\bat\s+\S+\s*\(|[A-Za-z]:\\/);
  });
});
