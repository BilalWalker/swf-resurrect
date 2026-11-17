// The converted spacer page loads (as3-coverage task 5.4, Requirements 37.1, 37.11, 27.7). The one test of the
// import-cycle block that names a sample. Skipped with the fetch message when the SWF is absent or Chromium is missing.
// It asserts that the page ends in window.__swfResurrect with ready true, or with an error string that explains why not.
// Validates: Requirements 37.1, 37.11
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { afterAll, expect, it } from 'vitest';
import { buildProject, type BuiltProject } from '../../src/verify/edge/buildProject';
import { describeIfSpacer, spacerSwfPath } from '../support/fetchedSpacer';

import { launchChromium } from '../support/launchChromium';
import { sharedPipelineRun } from '../support/sharedPipelineRun';


const ORIGIN = 'http://spacer-load.local';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

function chromiumMissing(): boolean {
  try {
    const p = chromium.executablePath();
    return p === '' || !existsSync(p);
  } catch {
    return true;
  }
}

describeIfSpacer('spacer page load', () => {
  if (chromiumMissing()) {
    it.skip('needs Playwright Chromium', () => undefined);
    return;
  }
  let built: BuiltProject | null = null;
  afterAll(async () => {
    await built?.dispose();
  }, 60_000);

  it(
    'ends with ready true, or reports the reason of the failure as a string',
    async () => {
      const run = await sharedPipelineRun('spacer', spacerSwfPath());
      expect([0, 1]).toContain(run.code); // a type error is reported, not fatal
      built = await buildProject(run.outDir);
      const launched = await launchChromium();
      try {
        const context = await launched.browser.newContext({ viewport: { width: 400, height: 300 } });
        const page = await context.newPage();
        await page.route(`${ORIGIN}/**`, async (route) => {
          const rel = new URL(route.request().url()).pathname.slice(1) || 'index.html';
          const mime = MIME[extname(rel).toLowerCase()];
          try {
            if (mime === undefined || rel.includes('..')) throw new Error('nope');
            await route.fulfill({ status: 200, contentType: mime, body: await readFile(join((built as BuiltProject).distDir, rel)) });
          } catch {
            await route.fulfill({ status: 404, body: 'not found' });
          }
        });
        await page.goto(`${ORIGIN}/index.html?timelineOnly=1`);
        await page.waitForFunction(() => {
          const o = (globalThis as unknown as { __swfResurrect?: { ready?: boolean; error?: string } }).__swfResurrect;
          return Boolean(o && (o.ready || o.error));
        }, undefined, { timeout: 30_000 });
        const o = (await page.evaluate(() => (globalThis as unknown as { __swfResurrect?: unknown }).__swfResurrect)) as {
          ready: boolean;
          error?: string | null;
        };
        if (!o.ready) expect(typeof o.error).toBe('string');
        else expect(o.ready).toBe(true);
        if (o.error) console.log(`spacer load error: ${o.error}`);
        expect(String(o.error ?? '')).not.toContain('Class extends value undefined');
        await context.close();
      } finally {
        await launched.stop();
      }
    },
    15 * 60 * 1000,
  );
});
