// Public-host limits through real HTTP: the per-client rate limit on new jobs and the
// X-Forwarded-For handling behind TRUST_PROXY. FFDec is deliberately missing, so an admitted job
// is refused with 503 (setup not ready) and nothing is converted.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../../web/server/main';
import type { RunningServer } from '../../web/server/main';
import { rawRequest, testServerOptions } from './helpers';

const SWF = Buffer.from('FWS\x0a not really a movie, never converted');

let dir: string;
const servers: RunningServer[] = [];

async function start(trustProxyHops: number, uploadsEnabled = true): Promise<RunningServer> {
  const s = await startServer(
    testServerOptions({ ffdecJar: join(dir, 'missing.jar'), rateLimit: { burst: 1, perHour: 2 }, trustProxyHops, uploadsEnabled }),
    { runsDir: join(dir, `runs-${servers.length}`), log: () => undefined },
  );
  servers.push(s);
  return s;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'swf-public-'));
});

afterAll(async () => {
  for (const s of servers) await s.close();
  await rm(dir, { recursive: true, force: true });
});

describe('rate limit on job creation', () => {
  it('admits a burst per client, then answers 429 with Retry-After; X-Forwarded-For is ignored', async () => {
    const s = await start(0);
    expect((await rawRequest(s.port, 'POST', '/api/jobs/sample/clickgoto')).status).toBe(503);
    const limited = await rawRequest(s.port, 'POST', '/api/jobs/sample/clickgoto', undefined, { 'x-forwarded-for': '198.51.100.9' });
    expect(limited.status).toBe(429);
    // One token per 30 minutes.
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(1700);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(1800);
    expect(JSON.parse(limited.body.toString()).error).toMatch(/Too many conversions .* 30 minutes/);
    const upload = await rawRequest(s.port, 'POST', '/api/jobs', SWF, { 'content-type': 'application/octet-stream' });
    expect(upload.status).toBe(429);
    // Reading is never limited.
    expect((await rawRequest(s.port, 'GET', '/api/samples')).status).toBe(200);
  });

  it('keys clients on the trusted proxy entry when TRUST_PROXY is set', async () => {
    const s = await start(1);
    const as = (xff: string): Promise<number> =>
      rawRequest(s.port, 'POST', '/api/jobs/sample/clickgoto', undefined, { 'x-forwarded-for': xff }).then((r) => r.status);
    expect(await as('203.0.113.1')).toBe(503);
    expect(await as('203.0.113.1')).toBe(429);
    // A spoofed left part does not make a new client...
    expect(await as('10.9.9.9, 203.0.113.1')).toBe(429);
    // ...but a different real address is.
    expect(await as('203.0.113.1, 203.0.113.2')).toBe(503);
  });
});

describe('gallery-only mode (SWF_RESURRECT_UPLOADS=off)', () => {
  it('refuses uploads with 403 before reading the body, and says so in setup', async () => {
    const s = await start(0, false);
    const setup = JSON.parse((await rawRequest(s.port, 'GET', '/api/setup')).body.toString()) as { uploadsEnabled: boolean };
    expect(setup.uploadsEnabled).toBe(false);
    const r = await rawRequest(s.port, 'POST', '/api/jobs', SWF, { 'content-type': 'application/octet-stream' });
    expect(r.status).toBe(403);
    expect(r.headers.connection).toBe('close');
    expect(JSON.parse(r.body.toString()).error).toMatch(/^Uploads are disabled on this host\./);
    // Re-runs of earlier uploads go through the same refusal.
    await expect(s.jobs.submitUpload(SWF, 'x.swf', true)).rejects.toMatchObject({ status: 403 });
    // Samples are still accepted (here refused only because FFDec is missing).
    expect((await rawRequest(s.port, 'POST', '/api/jobs/sample/clickgoto')).status).toBe(503);
  });

  it('reports uploads as enabled by default', async () => {
    const s = await start(0);
    const setup = JSON.parse((await rawRequest(s.port, 'GET', '/api/setup')).body.toString()) as { uploadsEnabled: boolean };
    expect(setup.uploadsEnabled).toBe(true);
  });
});
