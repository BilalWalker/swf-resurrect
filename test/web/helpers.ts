// Shared by the web server tests.
import { request } from 'node:http';
import type { OutgoingHttpHeaders } from 'node:http';
import { REPO_ROOT } from '../../web/server/main';
import { parseServerOptions } from '../../web/server/options';
import type { ServerOptions } from '../../web/server/options';

/** Local defaults (no NODE_ENV, no limits from the environment), random port, then overrides. */
export function testServerOptions(overrides: Partial<ServerOptions> = {}): ServerOptions {
  const parsed = parseServerOptions(['--port', '0'], {}, REPO_ROOT);
  if (!parsed.ok) throw new Error(parsed.message);
  return {
    ...parsed.options,
    retention: { maxAgeMs: 0, maxTotalBytes: 0, maxJobs: 0, orphanGraceMs: 3600_000 },
    sweepIntervalMs: 0,
    ...overrides,
  };
}

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/** Raw request, so paths reach the server exactly as written (no URL normalisation). */
export function rawRequest(port: number, method: string, path: string, body?: Buffer, headers: OutgoingHttpHeaders = {}): Promise<RawResponse> {
  return new Promise((res, rej) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers, agent: false }, (r) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => res({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', rej);
    req.end(body);
  });
}
