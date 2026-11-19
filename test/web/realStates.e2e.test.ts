// Real result pages, on request: one real job per Outcome through the server (real pipeline, real
// preview build, no faked API), opened in Chromium and saved to .work/ui-states/real/. Run with
// SWF_RESURRECT_UI_SHOTS=1; needs Java and the FFDec jar. The default suite skips it: it takes about
// a minute and its output is screenshots for review.
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JobSummary } from '../../web/shared/api';
import { REPO_ROOT, startServer } from '../../web/server/main';
import type { RunningServer } from '../../web/server/main';
import { TAG, buildSwf, tag } from '../support/hostileSwf';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';
import { testServerOptions } from './helpers';

const requested = process.env.SWF_RESURRECT_UI_SHOTS === '1';
const SHOTS = join(REPO_ROOT, '.work', 'ui-states', 'real');

let server: RunningServer;
let chrome: LaunchedChromium;
let runsDir: string;

beforeAll(async () => {
  if (!requested) return;
  runsDir = await mkdtemp(join(tmpdir(), 'web-real-'));
  server = await startServer(testServerOptions({ dev: true }), { runsDir, log: () => undefined });
  chrome = await launchChromium();
  await mkdir(SHOTS, { recursive: true });
}, 120_000);

afterAll(async () => {
  await chrome?.stop();
  await server?.close();
  if (runsDir !== undefined) await rm(runsDir, { recursive: true, force: true });
}, 60_000);

async function settle(created: Promise<{ id: string }>): Promise<JobSummary> {
  const { id } = await created;
  const j = await server.jobs.whenSettled(id);
  if (j === undefined) throw new Error('job vanished');
  return j;
}

async function shoot(j: JobSummary, name: string): Promise<string> {
  const page = await chrome.browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.goto(`${server.url}/#/job/${j.id}`);
    await page.waitForSelector('.result-slot > *, .failure:not([hidden])', { timeout: 30_000 });
    // Ruffle and the converted build draw a few frames first.
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
    return (await page.textContent('main')) ?? '';
  } finally {
    await page.close();
  }
}

describe.skipIf(!requested)('real result pages', () => {
  it('converted: gradients', { timeout: 240_000 }, async () => {
    const j = await settle(server.jobs.submitSample('gradients', true));
    expect(j.outcome?.outcome).toBe('converted');
    expect(await shoot(j, 'converted')).toContain('It lives.');
  });

  it('converted-with-gaps: slider_component', { timeout: 240_000 }, async () => {
    const j = await settle(server.jobs.submitSample('slider_component', true));
    expect(j.outcome?.outcome).toBe('converted-with-gaps');
    const text = await shoot(j, 'converted-with-gaps');
    expect(text).toContain('Converted with gaps');
  });

  it('refused: a generated ActionScript 1/2 file', { timeout: 120_000 }, async () => {
    const j = await settle(server.jobs.submitUpload(Buffer.from(buildSwf({ tags: [tag(TAG.DoAction, [0])] })), 'as2-game.swf', true));
    expect(j.status).toBe('refused');
    expect(await shoot(j, 'refused')).toContain('This tool converts ActionScript 3 files');
  });

  it('failed: Java gone after start-up', { timeout: 120_000 }, async () => {
    const saved = process.env.PATH;
    process.env.PATH = resolve(runsDir, 'no-such-dir');
    let j: JobSummary;
    try {
      j = await settle(server.jobs.submitSample('tweendemo', true));
    } finally {
      process.env.PATH = saved;
    }
    expect(j.status).toBe('failed');
    expect(await shoot(j, 'failed')).toContain('Something went wrong on our side');
  });
});
