// The landing page and gallery keep every text at WCAG AA against what is really behind it, at
// desktop and phone width (brief 3). Dev server, the committed samples; no job runs.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../../web/server/main';
import type { RunningServer } from '../../web/server/main';
import { holdPipelineSlot } from '../support/holdPipelineSlot';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';
import { testServerOptions } from './helpers';
import { lowContrastTexts } from './textContrast';

let server: RunningServer;
let chrome: LaunchedChromium;
let runsDir: string;

describe('landing contrast (Chromium)', () => {
  // Chromium in this process counts against the suite's pipeline slots, like the engine's browser tests.
  holdPipelineSlot();
  beforeAll(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'web-landing-contrast-'));
    server = await startServer(testServerOptions({ dev: true }), { runsDir, log: () => undefined });
    chrome = await launchChromium();
  }, 120_000);

  afterAll(async () => {
    await chrome?.stop();
    await server?.close();
    await rm(runsDir, { recursive: true, force: true });
  }, 60_000);

  for (const width of [1280, 375]) {
    it(`every text reaches AA at ${width} px`, { timeout: 60_000 }, async () => {
      const context = await chrome.browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        await page.goto(`${server.url}/`);
        await page.waitForSelector('.stone', { state: 'attached' });
        await page.waitForTimeout(1500);
        expect(await lowContrastTexts(page)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
