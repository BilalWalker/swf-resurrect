// Chromium layer of the entity_game Play_Test (as3-coverage task 20.4). Same scenario and assertions as the Node layer
// (test/support/playScenarios.ts), on the built Emitted_Project loaded with ?play=1: a manual clock, no animation-frame
// loop, steps driven by window.__swfPlay. Wall time is used only to wait for the page to load.
// The shared run is taken first and released; the browser then holds one 'pipeline' slot (never nested).
// Skipped with a reason when Chromium is missing.
// Validates: Requirements 25.1, 25.3, 25.5, 25.7
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { buildProject } from '../../src/verify/edge/buildProject';
import { launchChromium } from '../support/launchChromium';
import { chromiumDriver } from '../support/playDriver';
import { playEntityGame, SEED_MATH_RANDOM } from '../support/playScenarios';
import { sharedPipelineRun } from '../support/sharedPipelineRun';
import { PIPELINE_SLOTS, withSlot } from '../support/slots';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'http://play.local';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

function skipReason(): string | null {
  let p = '';
  try {
    p = chromium.executablePath();
  } catch {
    /* fall through */
  }
  return p === '' || !existsSync(p) ? 'Playwright Chromium is not installed' : null;
}
const reason = skipReason();

describe.skipIf(reason !== null)(`entity_game Play_Test (Chromium layer)${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  it(
    'plays 30 seconds with the same assertions as the Node layer, no page error, no failed class at load',
    async () => {
      const run = await sharedPipelineRun('entity_game', resolve(repoRoot, 'samples/entity_game/test.swf'));
      expect(run.code).toBe(0);
      // The type-check gate: no class failed, none was left out of the registry.
      const report = JSON.parse(readFileSync(join(run.outDir, 'translation-report.json'), 'utf8')) as {
        omittedClasses: unknown[];
        classes: Array<{ className: string; status: string; omitted: boolean }>;
      };
      expect(report.omittedClasses).toEqual([]);
      expect(report.classes.filter((c) => c.omitted)).toEqual([]);

      await withSlot('pipeline', PIPELINE_SLOTS, async () => {
        const built = await buildProject(run.outDir);
        const launched = await launchChromium();
        try {
          const context = await launched.browser.newContext({ viewport: { width: 800, height: 600 } });
          const page = await context.newPage();
          const pageErrors: string[] = [];
          page.on('pageerror', (e) => pageErrors.push(e.message));
          page.on('console', (m) => {
            if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
          });
          await page.addInitScript(SEED_MATH_RANDOM);
          await page.route(`${ORIGIN}/**`, async (route) => {
            const url = new URL(route.request().url());
            const rel = decodeURIComponent(url.pathname.replace(/^\//, '') || 'index.html');
            const mime = MIME[extname(rel).toLowerCase()];
            try {
              if (mime === undefined || rel.includes('..')) throw new Error('nope');
              await route.fulfill({ status: 200, contentType: mime, body: await readFile(join(built.distDir, rel)) });
            } catch {
              await route.fulfill({ status: 404, body: 'not found' });
            }
          });
          await page.goto(`${ORIGIN}/index.html?play=1`);
          await page.waitForFunction(() => (window as any).__swfPlay !== undefined, undefined, { timeout: 60_000 });
          const outcome = await playEntityGame(chromiumDriver(page));
          expect(outcome.firstHit).not.toBeNull();
          expect(pageErrors).toEqual([]);
          await page.screenshot({ path: join(repoRoot, '.work', 'entity-play.png') });
          await context.close();
        } finally {
          await launched.stop();
          await built.dispose();
        }
      });
    },
    15 * 60 * 1000,
  );
});
