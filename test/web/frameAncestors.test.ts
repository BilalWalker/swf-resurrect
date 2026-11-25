// The production index page may be framed by its own origin only, or also by the origins in
// SWF_RESURRECT_FRAME_ANCESTORS (a host page such as a Hugging Face Space). No other header forbids
// framing, and other files carry no page CSP.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staticClient } from '../../web/server/http';

let dist: string;

async function headersOf(frameAncestors: readonly string[] | undefined, path: string): Promise<Headers> {
  const handler = frameAncestors === undefined ? staticClient(dist) : staticClient(dist, frameAncestors);
  const server: Server = createServer((req, res) => handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
    await res.arrayBuffer();
    expect(res.status).toBe(200);
    return res.headers;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const directive = (h: Headers): string | undefined =>
  h.get('content-security-policy')?.split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-ancestors'));

describe('frame-ancestors on the index page', () => {
  beforeAll(async () => {
    dist = await mkdtemp(join(tmpdir(), 'web-dist-'));
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>t</title>');
    await mkdir(join(dist, 'assets'));
    await writeFile(join(dist, 'assets', 'app.js'), 'void 0;');
  });
  afterAll(async () => {
    await rm(dist, { recursive: true, force: true });
  });

  it("allows only 'self' without the setting", async () => {
    for (const fa of [undefined, []]) {
      const h = await headersOf(fa, '/');
      expect(directive(h)).toBe("frame-ancestors 'self'");
      expect(h.get('x-frame-options')).toBeNull();
    }
  });

  it('adds the configured origins and changes nothing else', async () => {
    const plain = (await headersOf([], '/')).get('content-security-policy') ?? '';
    const h = await headersOf(['https://huggingface.co', 'https://example.org'], '/');
    expect(directive(h)).toBe("frame-ancestors 'self' https://huggingface.co https://example.org");
    expect(h.get('content-security-policy')).toBe(plain.replace("frame-ancestors 'self'", "frame-ancestors 'self' https://huggingface.co https://example.org"));
    expect(h.get('x-frame-options')).toBeNull();
    // The index page by name gets it too; assets carry no page CSP.
    expect(directive(await headersOf(['https://huggingface.co'], '/index.html'))).toBe("frame-ancestors 'self' https://huggingface.co");
    expect((await headersOf(['https://huggingface.co'], '/assets/app.js')).get('content-security-policy')).toBeNull();
  });
});
