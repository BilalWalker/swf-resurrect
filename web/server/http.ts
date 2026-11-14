// HTTP routes of the web app (node:http, no framework). Anything not handled here goes to `next`
// (Vite in dev, the built client in production).
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { ApiError, ResetEvent } from '../shared/api';
import { JobManager, SubmitError } from './jobs';
import { contentType } from './mime';
import { resolveInside } from './safePath';
import { hasSwfMagic, isSampleName, MAX_UPLOAD_BYTES } from './upload';

export interface HandlerContext {
  jobs: JobManager;
  repoRoot: string;
}

type Next = (req: IncomingMessage, res: ServerResponse) => void;

/** Headers on every response. */
export function baseHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  const body: ApiError = { error: message };
  sendJson(res, status, body);
}

/**
 * Serves one file under `root` named by the raw URL tail, or 400/404. `cors` adds
 * Access-Control-Allow-Origin: * for documents in sandboxed (opaque-origin) frames.
 */
async function sendFileInside(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  tail: string,
  o: { fallback?: string; cors?: boolean; type?: string; headers?: Record<string, string> } = {},
): Promise<void> {
  const r = resolveInside(root, tail, o.fallback);
  if (!r.ok) {
    sendError(res, 400, `Bad path: ${r.reason}`);
    return;
  }
  await sendFile(req, res, r.path, o);
}

async function sendFile(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  o: { cors?: boolean; type?: string; headers?: Record<string, string> } = {},
): Promise<void> {
  let st;
  try {
    st = await stat(path);
  } catch {
    sendError(res, 404, 'Not found');
    return;
  }
  if (!st.isFile()) {
    sendError(res, 404, 'Not found');
    return;
  }
  const headers: Record<string, string | number> = {
    'Content-Type': o.type ?? contentType(path),
    'Content-Length': st.size,
    'Cache-Control': 'no-cache',
    ...o.headers,
  };
  if (o.cors === true) headers['Access-Control-Allow-Origin'] = '*';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(path).pipe(res);
}

/** Reads the request body up to `limit` bytes; null (and a 413 sent) when it is larger. */
function readBody(req: IncomingMessage, res: ServerResponse, limit: number): Promise<Buffer | null> {
  return new Promise((resolveBody, reject) => {
    const declared = Number(req.headers['content-length'] ?? NaN);
    if (Number.isFinite(declared) && declared > limit) {
      sendError(res, 413, `The file is larger than ${limit / (1024 * 1024)} MB.`);
      req.resume();
      resolveBody(null);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        sendError(res, 413, `The file is larger than ${limit / (1024 * 1024)} MB.`);
        req.destroy();
        resolveBody(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) resolveBody(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (!done) reject(err);
    });
  });
}

function wantsRerun(url: URL): boolean {
  return url.searchParams.get('rerun') === '1';
}

export function createHandler(ctx: HandlerContext, next: Next): (req: IncomingMessage, res: ServerResponse) => void {
  const { jobs } = ctx;
  const ruffleDir = join(ctx.repoRoot, 'node_modules', '@ruffle-rs', 'ruffle');

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    baseHeaders(res);
    const url = new URL(req.url ?? '/', 'http://localhost');
    // Raw path keeps percent-encoding, so encoded traversal reaches resolveInside and is refused there.
    const rawPath = (req.url ?? '/').split('?')[0];
    const method = req.method ?? 'GET';
    const isGet = method === 'GET' || method === 'HEAD';

    if (rawPath.startsWith('/vendor/ruffle/')) {
      if (!isGet) return sendError(res, 405, 'Method not allowed');
      return sendFileInside(req, res, ruffleDir, rawPath.slice('/vendor/ruffle/'.length), { cors: true });
    }
    if (!rawPath.startsWith('/api/')) {
      next(req, res);
      return;
    }

    if (rawPath === '/api/setup' && isGet) return sendJson(res, 200, jobs.setupStatus());
    if (rawPath === '/api/samples' && isGet) return sendJson(res, 200, await jobs.listSamples());

    if (rawPath === '/api/jobs' && method === 'POST') {
      const body = await readBody(req, res, MAX_UPLOAD_BYTES);
      if (body === null) return;
      if (!hasSwfMagic(body)) return sendError(res, 415, 'This is not a SWF file (it does not start with FWS, CWS or ZWS).');
      const name = req.headers['x-filename'];
      try {
        return sendJson(res, 202, await jobs.submitUpload(body, typeof name === 'string' ? name : undefined, wantsRerun(url)));
      } catch (err) {
        if (err instanceof SubmitError) return sendError(res, err.status, err.message);
        throw err;
      }
    }

    let m = rawPath.match(/^\/api\/jobs\/sample\/([^/]+)$/);
    if (m && method === 'POST') {
      if (!isSampleName(m[1])) return sendError(res, 400, 'Bad sample name');
      req.resume();
      try {
        return sendJson(res, 202, await jobs.submitSample(m[1], wantsRerun(url)));
      } catch (err) {
        if (err instanceof SubmitError) return sendError(res, err.status, err.message);
        throw err;
      }
    }

    m = rawPath.match(/^\/api\/jobs\/([^/]+)(?:\/(.*))?$/);
    if (!m) return sendError(res, 404, 'Not found');
    const job = jobs.get(m[1]);
    if (job === undefined) return sendError(res, 404, 'No such job');
    const rest = m[2] ?? '';
    if (rest === 'rerun' && method === 'POST') {
      req.resume();
      try {
        return sendJson(res, 202, await jobs.rerun(job));
      } catch (err) {
        if (err instanceof SubmitError) return sendError(res, err.status, err.message);
        throw err;
      }
    }
    if (!isGet) return sendError(res, 405, 'Method not allowed');
    const dirs = jobs.dirs(job);

    if (rest === '') return sendJson(res, 200, jobs.summary(job));

    if (rest === 'events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const send = (event: string, data: unknown): void => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      // History first, so a late subscriber sees the whole run; then live changes.
      const reset: ResetEvent = { job: jobs.summary(job), log: jobs.log(job) };
      send('reset', reset);
      const unsubscribe = jobs.subscribe(job, (event, data) => send(event, data));
      const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
      req.on('close', () => {
        clearInterval(ping);
        unsubscribe();
      });
      return;
    }

    if (rest === 'swf') {
      return sendFile(req, res, dirs.swf, { cors: true, type: 'application/x-shockwave-flash' });
    }

    if (rest === 'app' || rest.startsWith('app/')) {
      // The converted app runs in <iframe sandbox="allow-scripts">: an opaque origin, so its
      // module scripts and fetches are cross-origin requests and need CORS.
      if (rest === 'app') {
        res.writeHead(301, { Location: `/api/jobs/${job.id}/app/` });
        res.end();
        return;
      }
      return sendFileInside(req, res, dirs.app, rest.slice('app/'.length), { cors: true, fallback: 'index.html' });
    }

    if (rest.startsWith('out/')) {
      // Reports and frames written by the pipeline. The report page gets a CSP with no scripts.
      const tail = rest.slice('out/'.length);
      const headers: Record<string, string> = tail.endsWith('.html')
        ? { 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'" }
        : {};
      return sendFileInside(req, res, dirs.out, tail, { headers });
    }

    if (rest === 'source') return sendJson(res, 200, jobs.sourceFiles(job));
    if (rest.startsWith('source/')) {
      const r = resolveInside(dirs.out, rest.slice('source/'.length));
      if (!r.ok) return sendError(res, 400, `Bad path: ${r.reason}`);
      if (!jobs.sourceFiles(job).some((f) => f.path === r.relative)) return sendError(res, 404, 'Not a source file of this project');
      return sendFile(req, res, r.path, { type: 'text/plain; charset=utf-8' });
    }

    if (rest === 'project.zip') {
      const zip = await jobs.projectZip(job);
      if (zip === null) return sendError(res, 404, 'This job has no finished project to download.');
      return sendFile(req, res, zip.path, {
        type: 'application/zip',
        headers: { 'Content-Disposition': `attachment; filename="${zip.fileName}"` },
      });
    }

    return sendError(res, 404, 'Not found');
  };

  return (req, res) => {
    handle(req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) sendError(res, 500, 'Internal server error');
      else res.destroy();
    });
  };
}

/** Production: the built client from web/dist, with index.html for unknown paths (hash routing). */
export function staticClient(distDir: string): Next {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "frame-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
  return (req, res) => {
    const rawPath = (req.url ?? '/').split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendError(res, 405, 'Method not allowed');
      return;
    }
    if (!existsSync(join(distDir, 'index.html'))) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('The web client is not built. Run "npm run web:build", or use "npm run web" for development.');
      return;
    }
    const tail = rawPath === '/' ? '' : rawPath.slice(1);
    const r = resolveInside(distDir, tail, 'index.html');
    if (!r.ok) {
      sendError(res, 400, `Bad path: ${r.reason}`);
      return;
    }
    const isIndex = r.relative === 'index.html';
    const headers: Record<string, string> = isIndex ? { 'Content-Security-Policy': csp } : {};
    // The Ruffle frame runs in a sandboxed (opaque-origin) iframe and loads Ruffle cross-origin.
    if (r.relative.startsWith('ruffle-frame.')) headers['Access-Control-Allow-Origin'] = '*';
    void sendFile(req, res, r.path, { headers });
  };
}

