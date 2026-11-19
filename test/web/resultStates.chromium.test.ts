// The job page renders each Outcome in its own state, in Chromium, against the dev server (Vite
// middleware, the client source as it is). The job API and its event stream are answered by the
// test, so no pipeline runs; `numbers: null` and `facts: null` cases are included. Screenshots go to
// .work/ui-states/ for review.
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JobOutcome, JobSummary, StageState } from '../../web/shared/api';
import { REPO_ROOT, startServer } from '../../web/server/main';
import type { RunningServer } from '../../web/server/main';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';
import { testServerOptions } from './helpers';

const SHOTS = join(REPO_ROOT, '.work', 'ui-states');

let server: RunningServer;
let runsDir: string;
let chrome: LaunchedChromium;

beforeAll(async () => {
  runsDir = await mkdtemp(join(tmpdir(), 'web-states-'));
  server = await startServer(testServerOptions({ dev: true }), { runsDir, log: () => undefined });
  chrome = await launchChromium();
  await mkdir(SHOTS, { recursive: true });
}, 120_000);

afterAll(async () => {
  await chrome?.stop();
  await server?.close();
  await rm(runsDir, { recursive: true, force: true });
});

const STAGES = ['unpack', 'convert', 'translate', 'emit', 'typecheck', 'verify', 'build'] as const;
function stages(status: StageState['status'][]): StageState[] {
  return STAGES.map((key, i) => ({ key, status: status[i] ?? 'skipped', detail: null, facts: {} }));
}

const numbers = (translated: number, candidates: number, typeErrors: number): NonNullable<JobOutcome['numbers']> => ({
  candidateClasses: candidates,
  translatedClasses: translated,
  cleanClasses: translated,
  looseClasses: 0,
  untranslatedCodeClasses: 0,
  unparsedClasses: 0,
  unsupportedClasses: candidates - translated,
  omittedClasses: candidates - translated,
  typeErrors,
  droppedPlacements: 0,
  namedLimits: 0,
  stubDependentClasses: 0,
});

function outcome(o: Partial<JobOutcome> & Pick<JobOutcome, 'outcome'>): JobOutcome {
  return { reasonCode: null, reason: '', numbers: null, gaps: [], facts: null, obfuscation: null, referenceId: null, runLimitS: 300, ...o };
}

function job(id: string, over: Partial<JobSummary>): JobSummary {
  return {
    id,
    name: 'game.swf',
    source: 'upload',
    sample: null,
    sha256: 'ab'.repeat(32),
    status: 'succeeded',
    queuePosition: null,
    stages: stages(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']),
    warnings: [],
    error: null,
    outcome: null,
    verifyNotes: [],
    createdAt: '2026-11-18T10:00:00.000Z',
    startedAt: '2026-11-18T10:00:00.000Z',
    finishedAt: '2026-11-18T10:00:42.000Z',
    timeoutSeconds: 300,
    results: null,
    artifacts: { app: true, report: false, project: true, sourceFiles: 0 },
    ...over,
  };
}

const id = (n: number): string => n.toString(16).padStart(24, '0');

/** Answers the job, its events and its players for one job; everything else goes to the server. */
async function open(j: JobSummary, shot: string): Promise<Page> {
  const page = await chrome.browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.route(`**/api/jobs/${j.id}`, (r) => r.fulfill({ json: j }));
  await page.route(`**/api/jobs/${j.id}/events`, (r) =>
    r.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: reset\ndata: ${JSON.stringify({ job: j, log: [] })}\n\n` }),
  );
  await page.route(`**/api/jobs/${j.id}/app/**`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="background:#123">converted</body>' }));
  // A real sample plays in the Ruffle panel (CORS: the Ruffle frame is an opaque origin).
  const swf = await readFile(join(REPO_ROOT, 'samples', 'clickgoto', 'test.swf'));
  await page.route(`**/api/jobs/${j.id}/swf`, (r) =>
    r.fulfill({ body: swf, contentType: 'application/x-shockwave-flash', headers: { 'Access-Control-Allow-Origin': '*' } }),
  );
  await page.goto(`${server.url}/#/job/${j.id}`);
  await page.waitForSelector('.result-slot > *, .failure:not([hidden])', { timeout: 30_000 });
  // Give Ruffle a moment to draw the first frame before the screenshot.
  if ((await page.locator('.is-original').count()) > 0) await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SHOTS, `${shot}.png`), fullPage: true });
  return page;
}

describe('result page per Outcome (Chromium)', () => {
  it('converted: as before, with the download', { timeout: 60_000 }, async () => {
    const page = await open(job(id(1), { outcome: outcome({ outcome: 'converted', reason: '4 of 4 classes translated', numbers: numbers(4, 4, 0) }) }), 'converted');
    expect(await page.textContent('.alive-title')).toBe('It lives.');
    expect(await page.locator('.gap-panel').count()).toBe(0);
    expect(await page.locator('a[download]').count()).toBe(1);
    expect(await page.locator('.is-original .side-name').textContent()).toBe('Original (Flash, played by Ruffle)');
    expect(await page.locator('.is-converted .side-name').textContent()).toBe('Converted (TypeScript + PixiJS)');
    await page.close();
  });

  it('converted-with-gaps: the gap panel with counts in plain words', { timeout: 60_000 }, async () => {
    const page = await open(
      job(id(2), {
        outcome: outcome({
          outcome: 'converted-with-gaps',
          reason: '5 of 6 classes translated, 2 type errors',
          numbers: numbers(5, 6, 2),
          gaps: [
            { kind: 'type-error', count: 2, examples: [] },
            { kind: 'untranslated-class', count: 1, examples: [] },
          ],
          obfuscation: { recovered: true, fallback: false, recoveredClasses: 5, candidateClasses: 6, unrecoverableClasses: 0 },
        }),
      }),
      'converted-with-gaps',
    );
    const panel = (await page.textContent('.gap-panel')) ?? '';
    expect(panel).toContain('5 of 6 classes translated');
    expect(panel).toContain('2 type errors in the TypeScript');
    expect(panel).toContain('1 class was not translated');
    expect(panel).toContain('obfuscated: names renamed');
    expect(panel).not.toContain('will probably not run');
    await page.close();
  });

  it('converted-with-gaps with few classes and numbers: null', { timeout: 60_000 }, async () => {
    const few = await open(
      job(id(3), { outcome: outcome({ outcome: 'converted-with-gaps', numbers: numbers(1, 9, 0), gaps: [{ kind: 'class-omitted', count: 8, examples: [] }] }) }),
      'converted-with-gaps-few',
    );
    expect(await few.textContent('.gap-panel')).toContain('will probably not run');
    await few.close();
    const none = await open(job(id(4), { outcome: outcome({ outcome: 'converted-with-gaps', numbers: null, facts: null, gaps: [{ kind: 'type-error', count: 1, examples: [] }] }) }), 'converted-with-gaps-null');
    const text = (await none.textContent('.gap-panel')) ?? '';
    expect(text).toContain('1 type error in the TypeScript');
    expect(text).not.toContain('classes translated');
    await none.close();
  });

  it('refused: the reason large, what to try, no download and no converted player', { timeout: 60_000 }, async () => {
    const page = await open(
      job(id(5), {
        status: 'refused',
        stages: stages(['skipped']),
        artifacts: { app: false, report: false, project: false, sourceFiles: 0 },
        outcome: outcome({ outcome: 'refused', reasonCode: 'actionscript-1-2', reason: 'the file uses ActionScript 1 or 2, which is not supported', numbers: null, facts: null }),
      }),
      'refused',
    );
    expect(await page.textContent('.outcome-reason')).toBe('the file uses ActionScript 1 or 2, which is not supported');
    expect(await page.textContent('.outcome-hint')).toContain('This tool converts ActionScript 3 files');
    expect(await page.locator('a[download]').count()).toBe(0);
    expect(await page.locator('iframe[src*="/app/"]').count()).toBe(0);
    // The Ruffle panel is the only player, and says it is the original.
    expect(await page.locator('.is-original .side-name').textContent()).toBe('Original (Flash, played by Ruffle)');
    expect(await page.locator('iframe[src*="ruffle-frame.html"]').count()).toBe(1);
    expect(await page.locator('.is-converted').count()).toBe(0);
    await page.close();
  });

  it('refused not-swf: no player at all', { timeout: 60_000 }, async () => {
    const page = await open(
      job(id(7), {
        status: 'refused',
        stages: stages(['failed']),
        artifacts: { app: false, report: false, project: false, sourceFiles: 0 },
        outcome: outcome({ outcome: 'refused', reasonCode: 'not-swf', reason: 'the file is not a SWF', numbers: null, facts: null }),
      }),
      'refused-not-swf',
    );
    expect(await page.textContent('.outcome-hint')).toContain('.swf');
    expect(await page.locator('iframe').count()).toBe(0);
    await page.close();
  });

  it('failed: our side, the reference id, no stack trace', { timeout: 60_000 }, async () => {
    const page = await open(
      job(id(6), {
        status: 'failed',
        stages: stages(['ok', 'ok', 'failed']),
        error: { stage: 'translate', reportedStage: 'pipeline', message: 'an internal error stopped the run (reference 3fa9c01e)' },
        artifacts: { app: false, report: false, project: false, sourceFiles: 0 },
        outcome: outcome({ outcome: 'failed', reasonCode: 'internal-error', reason: 'an internal error stopped the run (reference 3fa9c01e)', referenceId: '3fa9c01e', numbers: null, facts: null }),
      }),
      'failed',
    );
    const text = (await page.textContent('.failure')) ?? '';
    expect(text).toContain('Something went wrong on our side');
    expect(text).toContain('3fa9c01e');
    expect(await page.locator('.failure pre').count()).toBe(0);
    expect(await page.locator('.failure .is-original .side-name').textContent()).toBe('Original (Flash, played by Ruffle)');
    expect(await page.locator('a[download]').count()).toBe(0);
    await page.close();
  });
});
