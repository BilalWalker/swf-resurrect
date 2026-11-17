// Chromium layer of the spacer Play_Test (as3-coverage task 31, Requirement 25.2): the same scenario and assertions as the Node
// layer (test/support/playSpacer.ts) on the built Emitted_Project loaded with ?play=1 (manual clock, no animation-frame loop).
// A second page measures two Block A items on the real built page: keys from the browser with no prior click (Playwright
// keyboard, the window listener of main.ts), and that the Stage children the game adds (Player) are drawn.
// The shared run is taken first and released; the browser then holds one 'pipeline' slot. Skipped with the fetch message when
// the SWF is absent, with a reason when Chromium is missing.
// Validates: Requirements 25.1, 25.2, 25.3, 25.5, 25.7
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';
import { expect, it } from 'vitest';
import { buildProject } from '../../src/verify/edge/buildProject';
import { describeIfSpacer, spacerSwfPath } from '../support/fetchedSpacer';
import { launchChromium } from '../support/launchChromium';
import { chromiumDriver } from '../support/playDriver';
import { flyLabelsOf, HANDWRITTEN_SPACER, playSpacer, SEED_MATH_RANDOM, SPACER_EXPECTED_NAMED_LIMITS } from '../support/playScenarios';
import { sharedPipelineRun } from '../support/sharedPipelineRun';
import { PIPELINE_SLOTS, withSlot } from '../support/slots';

const ORIGIN = 'http://spacer-play.local';
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

/** Pixels that differ between two same-size screenshots inside a box centred on (x, y). */
function changedIn(a: PNG, b: PNG, x: number, y: number, half: number): number {
  let n = 0;
  for (let j = Math.max(0, y - half); j < Math.min(a.height, y + half); j++) {
    for (let i = Math.max(0, x - half); i < Math.min(a.width, x + half); i++) {
      const k = (j * a.width + i) * 4;
      if (Math.abs(a.data[k]! - b.data[k]!) + Math.abs(a.data[k + 1]! - b.data[k + 1]!) + Math.abs(a.data[k + 2]! - b.data[k + 2]!) > 30) n++;
    }
  }
  return n;
}

describeIfSpacer('spacer Play_Test (Chromium layer)', () => {
  if (chromiumMissing()) {
    it.skip('needs Playwright Chromium', () => undefined);
    return;
  }
  if (!existsSync(HANDWRITTEN_SPACER)) {
    it.skip(`needs ${HANDWRITTEN_SPACER} (the hand-written KeyObject and PhysicEngine)`, () => undefined);
    return;
  }
  it(
    'plays 30 seconds with the Node layer assertions; keys work with no click; Stage children are drawn',
    async () => {
      const run = await sharedPipelineRun('spacer', spacerSwfPath());
      expect([0, 1]).toContain(run.code);
      const report = JSON.parse(readFileSync(join(run.outDir, 'translation-report.json'), 'utf8')) as { omittedClasses: unknown[] };
      expect(report.omittedClasses).toEqual([]);
      const flyLabels = flyLabelsOf(readFileSync(join(run.outDir, 'assets', 'scene.json'), 'utf8'));

      await withSlot('pipeline', PIPELINE_SLOTS, async () => {
        const built = await buildProject(run.outDir);
        const launched = await launchChromium();
        try {
          const context = await launched.browser.newContext({ viewport: { width: 800, height: 700 } });
          const open = async (): Promise<{ page: Page; pageErrors: string[] }> => {
            const page = await context.newPage();
            const pageErrors: string[] = [];
            page.on('pageerror', (e) => pageErrors.push(e.message));
            page.on('console', (m) => {
              if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
            });
            await page.addInitScript(SEED_MATH_RANDOM);
            await page.route(`${ORIGIN}/**`, async (route) => {
              const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html');
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
            return { page, pageErrors };
          };

          // The scenario through window.__swfPlay.
          const a = await open();
          const playA = chromiumDriver(a.page);
          const outcome = await playSpacer(playA, flyLabels);
          expect(outcome.death.goneTick).toBeGreaterThan(outcome.death.hitTick);
          expect(outcome.namedLimits.filter((id) => !SPACER_EXPECTED_NAMED_LIMITS.includes(id))).toEqual([]);
          expect(a.pageErrors).toEqual([]);
          await playA.render();
          await a.page.screenshot({ path: join(fileURLToPath(new URL('../../.work/', import.meta.url)), 'spacer-play.png') });
          await a.page.close();

          // Block A: browser keys with no click on the page (Ruffle needed a click on the player first), and drawn Stage children.
          const b = await open();
          const play = chromiumDriver(b.page);
          await play.step(4);
          await b.page.keyboard.down('Enter');
          await play.step(3);
          await b.page.keyboard.up('Enter');
          await play.step(3);
          const started = (await play.inspect()).find('Player');
          console.log(`spacer Block A: keys with no prior click start the level: ${started.length > 0}`);
          expect(started.length).toBeGreaterThan(0);
          const p0 = started[0]!;
          await play.render();
          const before = PNG.sync.read(await b.page.screenshot());
          await b.page.keyboard.down('ArrowRight');
          await play.step(30);
          await b.page.keyboard.up('ArrowRight');
          await play.step(5);
          const p1 = (await play.inspect()).find('Player')[0]!;
          await play.render();
          const after = PNG.sync.read(await b.page.screenshot());
          expect(p1.x).toBeGreaterThan(p0.x + 50);
          const atOld = changedIn(before, after, Math.round(p0.x), Math.round(p0.y), 20);
          const atNew = changedIn(before, after, Math.round(p1.x), Math.round(p1.y), 20);
          const farAway = changedIn(before, after, 400, 650, 20);
          console.log(`spacer Block A: Stage child Player drawn: changed pixels at old ${atOld}, new ${atNew}, control ${farAway}`);
          expect(atOld).toBeGreaterThan(100);
          expect(atNew).toBeGreaterThan(100);
          expect(farAway).toBe(0);
          expect(b.pageErrors).toEqual([]);
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
