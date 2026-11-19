// An uploaded SWF lives in its job folder (input/upload.swf): the /swf route of a job serves only that
// job's file, and the retention sweep deletes it with the folder, after which no job serves it.
// Real HTTP on a random port; no pipeline runs (persisted jobs are loaded from disk).
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initialState } from '../../web/server/jobState';
import { startServer } from '../../web/server/main';
import type { RunningServer } from '../../web/server/main';
import { rawRequest, testServerOptions } from './helpers';

const H = 3600_000;
const OLD = 'a1'.repeat(12);
const NEW = 'b2'.repeat(12);
const OLD_SWF = Buffer.from('FWS\x0a the old upload, past its retention');
const NEW_SWF = Buffer.from('FWS\x0a the new upload, still kept');

let root: string;
let runsDir: string;
let server: RunningServer | undefined;

async function persistUpload(id: string, bytes: Buffer, finishedHoursAgo: number): Promise<void> {
  const dir = join(runsDir, id);
  await mkdir(join(dir, 'input'), { recursive: true });
  await writeFile(join(dir, 'input', 'upload.swf'), bytes);
  const at = new Date(Date.now() - finishedHoursAgo * H).toISOString();
  await writeFile(
    join(dir, 'job.json'),
    JSON.stringify({
      formatVersion: 1,
      id,
      name: 'upload.swf',
      source: 'upload',
      sample: null,
      sha256: id.repeat(3).slice(0, 64),
      swfPath: join(dir, 'input', 'upload.swf'),
      state: { ...initialState(), status: 'refused' },
      log: [],
      createdAt: at,
      startedAt: at,
      finishedAt: at,
    }),
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'swf-upload-retention-'));
  runsDir = join(root, '.work', 'web-runs');
  await mkdir(runsDir, { recursive: true });
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

describe('uploaded SWF and retention', () => {
  it('serves each job only its own upload, and the sweep removes it with the job folder', async () => {
    await persistUpload(OLD, OLD_SWF, 1);
    await persistUpload(NEW, NEW_SWF, 1);
    server = await startServer(
      testServerOptions({ ffdecJar: join(root, 'missing.jar'), retention: { maxAgeMs: 72 * H, maxTotalBytes: 0, maxJobs: 0, orphanGraceMs: H } }),
      { repoRoot: root, runsDir, log: () => undefined },
    );
    const get = (path: string) => rawRequest(server!.port, 'GET', path);

    const oldBody = await get(`/api/jobs/${OLD}/swf`);
    const newBody = await get(`/api/jobs/${NEW}/swf`);
    expect(oldBody.status).toBe(200);
    expect(oldBody.body.equals(OLD_SWF)).toBe(true);
    expect(newBody.body.equals(NEW_SWF)).toBe(true);
    // No path under one job reaches another job's file.
    for (const p of [`/api/jobs/${NEW}/swf/../../${OLD}/swf`, `/api/jobs/${NEW}/out/..%2f..%2f${OLD}%2finput%2fupload.swf`, `/api/jobs/${NEW}/app/..%2f..%2f${OLD}%2finput%2fupload.swf`]) {
      const r = await get(p);
      expect(r.body.includes(OLD_SWF), p).toBe(false);
    }

    // Age the first job past the limit (100 h ago) and sweep, as the server does on its timer.
    await persistUpload(OLD, OLD_SWF, 100);
    await server.close();
    server = await startServer(
      testServerOptions({ ffdecJar: join(root, 'missing.jar'), retention: { maxAgeMs: 72 * H, maxTotalBytes: 0, maxJobs: 0, orphanGraceMs: H } }),
      { repoRoot: root, runsDir, log: () => undefined },
    );
    expect(existsSync(join(runsDir, OLD))).toBe(false);
    expect(existsSync(join(runsDir, OLD, 'input', 'upload.swf'))).toBe(false);
    expect((await get(`/api/jobs/${OLD}/swf`)).status).toBe(404);
    const kept = await get(`/api/jobs/${NEW}/swf`);
    expect(kept.status).toBe(200);
    expect(kept.body.equals(NEW_SWF)).toBe(true);
  });
});
