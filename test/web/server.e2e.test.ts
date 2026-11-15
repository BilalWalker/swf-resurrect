// End to end: the web server on a random port. The HTTP checks need nothing else; the conversion
// test needs Java and the FFDec jar (SWF_RESURRECT_FFDEC, else tools/ffdec/ffdec-cli.jar) and skips
// with the reason when either is missing.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateJobResponse, JobSummary } from '../../web/shared/api';
import { REPO_ROOT, startServer } from '../../web/server/main';
import type { RunningServer } from '../../web/server/main';
import { testServerOptions } from './helpers';

const jar = process.env.SWF_RESURRECT_FFDEC || join(REPO_ROOT, 'tools', 'ffdec', 'ffdec-cli.jar');
const javaOk = ((): boolean => {
  try {
    return spawnSync('java', ['-version'], { stdio: 'ignore', timeout: 15_000 }).status === 0;
  } catch {
    return false;
  }
})();
const skipReason = !javaOk ? 'Java is not on the PATH' : !existsSync(jar) ? `FFDec jar not found at ${jar} (set SWF_RESURRECT_FFDEC)` : null;
if (skipReason !== null) console.warn(`web e2e conversion test skipped: ${skipReason}`);

let server: RunningServer;
let runsDir: string;

/** Raw request, so paths reach the server exactly as written (no URL normalisation). */
function raw(method: string, path: string, body?: Buffer, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  return new Promise((res, rej) => {
    const req = request({ host: '127.0.0.1', port: server.port, method, path, headers, agent: false }, (r) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => res({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', rej);
    req.end(body);
  });
}

beforeAll(async () => {
  runsDir = resolve(REPO_ROOT, '.work', `test-web-runs-${process.pid}`);
  await mkdir(runsDir, { recursive: true });
  server = await startServer(
    testServerOptions({ timeoutMs: 240_000, ffdecJar: jar }),
    { runsDir },
  );
});

afterAll(async () => {
  await server?.close();
  await rm(runsDir, { recursive: true, force: true });
});

describe('web server HTTP', () => {
  it('answers setup and samples with security headers', async () => {
    const r = await raw('GET', '/api/samples');
    expect(r.status).toBe(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-type']).toContain('application/json');
    const samples = JSON.parse(r.body.toString()) as Array<{ name: string }>;
    expect(samples.map((s) => s.name)).toContain('clickgoto');
    expect((await raw('GET', '/api/setup')).status).toBe(200);
  });

  it('answers the health check without touching the pipeline', async () => {
    const r = await raw('GET', '/healthz');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(r.body.toString())).toEqual({ status: 'ok', running: 0, queued: 0 });
    expect((await raw('HEAD', '/healthz')).status).toBe(200);
    expect((await raw('POST', '/healthz')).status).toBe(405);
  });

  it('serves Ruffle and refuses traversal out of the vendor directory', async () => {
    const ok = await raw('GET', '/vendor/ruffle/ruffle.js');
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toContain('text/javascript');
    expect(ok.headers['access-control-allow-origin']).toBe('*');
    for (const p of [
      '/vendor/ruffle/../../../package.json',
      '/vendor/ruffle/%2e%2e/%2e%2e/%2e%2e/package.json',
      '/vendor/ruffle/..%2f..%2f..%2fpackage.json',
      '/vendor/ruffle/..%5c..%5c..%5cpackage.json',
      '/vendor/ruffle/C:/Windows/win.ini',
      '/vendor/ruffle/%2fetc%2fpasswd',
      '/vendor/ruffle/',
    ]) {
      const r = await raw('GET', p);
      expect([400, 404], p).toContain(r.status);
    }
  });

  it('refuses bad uploads early', async () => {
    const notSwf = await raw('POST', '/api/jobs', Buffer.from('PK\x03\x04 not a swf at all'), { 'x-filename': 'a.swf' });
    expect(notSwf.status).toBe(415);
    const big = await raw('POST', '/api/jobs', Buffer.alloc(16), { 'content-length': String(21 * 1024 * 1024) });
    expect(big.status).toBe(413);
  });

  it('gives 404 for unknown jobs and samples, including traversal-shaped ids', async () => {
    expect((await raw('GET', '/api/jobs/0123456789abcdef01234567')).status).toBe(404);
    expect((await raw('GET', '/api/jobs/..%2f..%2fpackage.json')).status).toBe(404);
    expect((await raw('POST', '/api/jobs/sample/nope')).status).toBe(404);
    expect((await raw('POST', '/api/jobs/sample/..%2f')).status).toBe(400);
  });
});

describe.skipIf(skipReason !== null)('web server conversion (needs Java and FFDec)', () => {
  it(
    'converts clickgoto and serves the built app, the report and the zip',
    async () => {
      const created = await raw('POST', '/api/jobs/sample/clickgoto');
      expect(created.status).toBe(202);
      const { id } = JSON.parse(created.body.toString()) as CreateJobResponse;
      expect(id).toMatch(/^[a-f0-9]{24}$/);

      // Follow the event stream until the job is finished.
      const events: string[] = [];
      const final = await new Promise<JobSummary>((res, rej) => {
        const req = request({ host: '127.0.0.1', port: server.port, path: `/api/jobs/${id}/events` }, (r) => {
          expect(r.headers['content-type']).toContain('text/event-stream');
          let buf = '';
          r.on('data', (c: Buffer) => {
            buf += c.toString();
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const ev = /^event: (.*)$/m.exec(block)?.[1];
              const data = /^data: (.*)$/m.exec(block)?.[1];
              if (ev === undefined || data === undefined) continue;
              events.push(ev);
              const job = ev === 'reset' ? (JSON.parse(data) as { job: JobSummary }).job : ev === 'job' ? (JSON.parse(data) as JobSummary) : null;
              if (job !== null && job.finishedAt !== null) {
                req.destroy();
                res(job);
              }
            }
          });
        });
        req.on('error', (e) => (e.message.includes('aborted') ? undefined : rej(e)));
        req.end();
      });

      expect(final.status, JSON.stringify(final.error)).toBe('succeeded');
      expect(events[0]).toBe('reset');
      expect(events).toContain('log');
      const byKey = Object.fromEntries(final.stages.map((s) => [s.key, s]));
      expect(byKey.convert.status).toBe('ok');
      expect(byKey.translate.facts.classes).toBeGreaterThan(0);
      expect(byKey.verify.status).toBe('ok');
      expect(byKey.build.status).toBe('ok');
      expect(final.results?.overallMatch?.value).not.toBeUndefined();
      expect(final.artifacts).toMatchObject({ app: true, report: true, project: true });

      const app = await raw('GET', `/api/jobs/${id}/app/`);
      expect(app.status).toBe(200);
      expect(app.headers['content-type']).toContain('text/html');
      expect(app.headers['content-security-policy']).toBe('sandbox allow-scripts');
      const script = /src="\.\/(assets\/[^"]+\.js)"/.exec(app.body.toString())?.[1];
      expect(script).toBeDefined();
      const js = await raw('GET', `/api/jobs/${id}/app/${script}`);
      expect(js.status).toBe(200);
      expect(js.headers['content-type']).toContain('text/javascript');

      const report = await raw('GET', `/api/jobs/${id}/out/fidelity-report.html`);
      expect(report.status).toBe(200);
      expect(report.body.toString()).toContain('Fidelity report');

      const zip = await raw('GET', `/api/jobs/${id}/project.zip`);
      expect(zip.status).toBe(200);
      expect(zip.headers['content-type']).toBe('application/zip');
      expect(zip.body.readUInt32LE(0)).toBe(0x04034b50);
      expect(zip.body.includes(Buffer.from('clickgoto-resurrected/package.json'))).toBe(true);
      expect(zip.body.includes(Buffer.from('node_modules/'))).toBe(false);

      for (const p of ['app/../job.json', 'app/%2e%2e/job.json', 'out/..%2fjob.json', 'source/src/../package.json']) {
        expect([400, 404], p).toContain((await raw('GET', `/api/jobs/${id}/${p}`)).status);
      }

      // Same bytes again: the cached result comes back at once.
      const again = JSON.parse((await raw('POST', '/api/jobs/sample/clickgoto')).body.toString()) as CreateJobResponse;
      expect(again).toEqual({ id, cached: true });
    },
    300_000,
  );
});
