// Page weight on first load: bytes transferred (body + headers) for the landing page and a real
// result page, in a fresh Chromium context with no cache, at desktop and phone width. Uses the
// production build (run `npm run web:build` first) and runs one real job (needs Java and FFDec).
//   npx tsx web/scripts/pageWeight.ts [sample]
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from '../../test/support/launchChromium';
import { REPO_ROOT, startServer } from '../server/main';
import { parseServerOptions } from '../server/options';

const sample = process.argv[2] ?? 'gradients';
const parsed = parseServerOptions(['--port', '0'], {}, REPO_ROOT);
if (!parsed.ok) throw new Error(parsed.message);
const runsDir = await mkdtemp(join(tmpdir(), 'page-weight-'));
const server = await startServer(parsed.options, { runsDir, log: () => undefined });
const chrome = await launchChromium();
try {
  const { id } = await server.jobs.submitSample(sample, true);
  const job = await server.jobs.whenSettled(id);
  if (job?.status !== 'succeeded') throw new Error(`the ${sample} job ended ${job?.status}`);
  const pages: Array<[string, string]> = [
    ['landing', `${server.url}/`],
    [`result (${sample})`, `${server.url}/#/job/${id}`],
  ];
  for (const width of [1280, 375]) {
    for (const [name, url] of pages) {
      const context = await chrome.browser.newContext({ viewport: { width, height: 900 } });
      const byType = new Map<string, number>();
      let total = 0;
      let ruffle = 0;
      let app = 0;
      context.on('requestfinished', async (req) => {
        const s = await req.sizes().catch(() => null);
        if (s === null) return;
        const bytes = s.responseBodySize + s.responseHeadersSize;
        total += bytes;
        if (req.url().includes('/vendor/ruffle/')) ruffle += bytes;
        else if (/\/api\/jobs\/[^/]+\/(app\/|swf$)/.test(req.url())) app += bytes;
        byType.set(req.resourceType(), (byType.get(req.resourceType()) ?? 0) + bytes);
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(8000);
      const kb = (n: number): string => `${(n / 1024).toFixed(0)} KB`;
      const parts = [...byType].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${kb(n)}`).join(', ');
      console.log(`${name} @${width}: ${kb(total)} (${parts})`);
      console.log(`  of which Ruffle player ${kb(ruffle)}, the job's own SWF and converted app ${kb(app)}, page and art ${kb(total - ruffle - app)}`);
      await context.close();
    }
  }
} finally {
  await chrome.stop();
  await server.close();
  await rm(runsDir, { recursive: true, force: true });
}
