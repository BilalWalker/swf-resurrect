// The painted props are decoration only (brief 3): empty alt, aria-hidden, lazy, explicit sizes,
// hidden below 900 px, never over a text or a control, and the page never scrolls sideways. Checked on
// a mocked converted result page at the widths where each kind shows. From 1500 px the side pillars
// stand in the outer 180 px, never over text or controls, and the side props stand on them. Dev server; no job runs.
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT, startServer } from '../../web/server/main';
import type { RunningServer } from '../../web/server/main';
import type { JobSummary } from '../../web/shared/api';
import { holdPipelineSlot } from '../support/holdPipelineSlot';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';
import { testServerOptions } from './helpers';

let server: RunningServer;
let chrome: LaunchedChromium;
let runsDir: string;

const ID = 'de'.repeat(12);
const STAGES = ['unpack', 'convert', 'translate', 'emit', 'typecheck', 'verify', 'build'] as const;
const JOB: JobSummary = {
  id: ID,
  name: 'game.swf',
  source: 'upload',
  sample: null,
  sha256: 'ab'.repeat(32),
  status: 'succeeded',
  queuePosition: null,
  stages: STAGES.map((key) => ({ key, status: 'ok', detail: null, facts: {} })),
  warnings: [],
  error: null,
  outcome: null,
  verifyNotes: [],
  createdAt: '2026-11-24T10:00:00.000Z',
  startedAt: '2026-11-24T10:00:00.000Z',
  finishedAt: '2026-11-24T10:00:30.000Z',
  timeoutSeconds: 300,
  results: null,
  artifacts: { app: true, report: false, project: true, sourceFiles: 0 },
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function layout(width: number): Promise<{
  props: Array<Box & { name: string; alt: string | null; hidden: string | null; loading: string | null; sized: boolean }>;
  pillars: Array<Box & { hidden: string | null }>;
  texts: Array<Box & { what: string }>;
  scrollX: number;
}> {
  const page = await chrome.browser.newPage({ viewport: { width, height: 900 } });
  try {
    const swf = await readFile(join(REPO_ROOT, 'samples', 'clickgoto', 'test.swf'));
    await page.route(`**/api/jobs/${ID}`, (r) => r.fulfill({ json: JOB }));
    await page.route(`**/api/jobs/${ID}/events`, (r) =>
      r.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: reset\ndata: ${JSON.stringify({ job: JOB, log: [] })}\n\n` }),
    );
    await page.route(`**/api/jobs/${ID}/app/**`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body>converted</body>' }));
    // The props are what is measured: the Ruffle frame is a blank page here, so six pages do not each
    // compile the 14 MB player under a loaded suite. Its iframe box still counts as a control.
    await page.route('**/ruffle-frame.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
    await page.route(`**/api/jobs/${ID}/swf`, (r) => r.fulfill({ body: swf, contentType: 'application/x-shockwave-flash', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.goto(`${server.url}/#/job/${ID}`);
    await page.waitForSelector('.result-slot > *');
    // Every prop loads (they are lazy): bring the whole page into view.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(1500);
    return await page.evaluate(String.raw`(() => {
      const box = (r) => ({ x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
      const props = [...document.querySelectorAll('img.prop')].map((p) => {
        const r = p.getBoundingClientRect();
        return { ...box(r), name: p.className, alt: p.getAttribute('alt'), hidden: p.getAttribute('aria-hidden'), loading: p.getAttribute('loading'), sized: p.hasAttribute('width') && p.hasAttribute('height') };
      });
      const texts = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!(n.textContent || '').trim() || !n.parentElement || n.parentElement.closest('[aria-hidden="true"], details:not([open]) > :not(summary)')) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) texts.push({ ...box(r), what: n.textContent.trim().slice(0, 40) });
      }
      for (const c of document.querySelectorAll('a, button, input, iframe, [role="tab"], summary')) {
        const r = c.getBoundingClientRect();
        if (r.width > 1 && r.height > 1) texts.push({ ...box(r), what: c.tagName + ' ' + (c.textContent || '').trim().slice(0, 30) });
      }
      const pillars = [...document.querySelectorAll('.pillar')].map((p) => ({ ...box(p.getBoundingClientRect()), hidden: p.closest('[aria-hidden]') ? p.closest('[aria-hidden]').getAttribute('aria-hidden') : null })).filter((p) => p.w > 0);
      return { props, pillars, texts, scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    })()`);
  } finally {
    await page.close();
  }
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('painted props (Chromium)', () => {
  // Chromium in this process counts against the suite's pipeline slots, like the engine's browser tests.
  holdPipelineSlot();
  beforeAll(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'web-decor-'));
    server = await startServer(testServerOptions({ dev: true }), { runsDir, log: () => undefined });
    chrome = await launchChromium();
  }, 120_000);

  afterAll(async () => {
    await chrome?.stop();
    await server?.close();
    await rm(runsDir, { recursive: true, force: true });
  }, 60_000);

  for (const width of [375, 899, 900, 1280, 1400, 1500, 1560, 1600, 1920]) {
    it(`at ${width} px: decorative, never over text or controls, no sideways scroll`, { timeout: 60_000 }, async () => {
      const { props, pillars, texts, scrollX } = await layout(width);
      expect(scrollX).toBe(0);
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) expect([p.alt, p.hidden, p.loading, p.sized]).toEqual(['', 'true', 'lazy', true]);
      const shown = props.filter((p) => p.w > 0 && p.h > 0);
      if (width < 900) expect(shown).toEqual([]);
      if (width >= 900) expect(shown.length).toBeGreaterThanOrEqual(2);
      // The margin props show from 1400 px. From 1500 px the side pillars stand in the outer 180 px and
      // the props stand on them (the pumpkins move onto the pillar bases).
      if (width >= 1400 && width < 1500) expect(shown.length).toBe(props.length);
      if (width >= 1500) {
        const gutter = shown.filter((p) => p.name.includes('is-gutter'));
        expect(gutter.map((p) => p.name).filter((n) => n.includes('pumpkin'))).toEqual([]);
        const offPillar = gutter.filter((p) => !(p.x >= 0 && p.x + p.w <= 188) && !(p.x >= width - 188 && p.x + p.w <= width)).map((p) => p.name);
        expect(offPillar).toEqual([]);
      }
      expect(pillars.length).toBe(width >= 1500 ? 2 : 0);
      for (const pl of pillars) {
        expect(pl.hidden).toBe('true');
        expect(pl.x >= 0 && pl.x + pl.w <= 180 ? 'left' : pl.x >= width - 180 && pl.x + pl.w <= width ? 'right' : 'outside the strip').not.toBe('outside the strip');
      }
      const pillarHits = pillars.flatMap((pl) => texts.filter((t) => overlaps(pl, t)).map((t) => `pillar over "${t.what}"`));
      expect(pillarHits).toEqual([]);
      const hits = shown.flatMap((p) => texts.filter((t) => overlaps(p, t)).map((t) => `${p.name} over "${t.what}"`));
      expect(hits).toEqual([]);
    });
  }
});
