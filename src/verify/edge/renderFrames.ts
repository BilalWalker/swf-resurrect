/** Renders Timeline_Only frames of a built Emitted_Project in headless Chromium (design section 5, D4, D5). */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import type { RgbaImage } from '../core/pixelDiff';
import { sanitizeDetail } from '../core/sanitize';
import { decodePng } from './png';

export const RENDER_WAIT_TIMEOUT_MS = 10_000;
const ORIGIN = 'http://verify.local';

/** Per-frame outcome: an image, or the sanitised reason it could not be rendered. */
export type RenderedFrame = RgbaImage | { renderFailed: string };

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function describe(err: unknown): string {
  return sanitizeDetail(err instanceof Error ? err.message : String(err));
}

/** Resolves a request path inside `root`, or null when it would escape it. */
function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const rel = decoded.replace(/^\/+/, '');
  const full = path.resolve(root, rel === '' ? 'index.html' : rel);
  const relative = path.relative(root, full);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

async function renderOne(context: Awaited<ReturnType<Browser['newContext']>>, distDir: string, frame: number): Promise<RenderedFrame> {
  let page: Page | null = null;
  try {
    page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') pageErrors.push(m.text());
    });
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const file = resolveInside(distDir, url.pathname);
      const mime = file === null ? undefined : MIME[path.extname(file).toLowerCase()];
      if (file === null || mime === undefined) {
        await route.fulfill({ status: 404, body: 'not found' });
        return;
      }
      try {
        await route.fulfill({ status: 200, contentType: mime, body: await readFile(file) });
      } catch {
        await route.fulfill({ status: 404, body: 'not found' });
      }
    });
    await page.goto(`${ORIGIN}/index.html?timelineOnly=${frame}`);
    await page.waitForFunction(
      () => {
        const o = (globalThis as unknown as { __swfResurrect?: { ready?: boolean; error?: string } }).__swfResurrect;
        return Boolean(o && (o.ready || o.error));
      },
      undefined,
      { timeout: RENDER_WAIT_TIMEOUT_MS },
    );
    const outcome = await page.evaluate(
      () => (globalThis as unknown as { __swfResurrect?: { ready?: boolean; png?: string | null; error?: string } }).__swfResurrect,
    );
    if (!outcome || !outcome.ready || typeof outcome.png !== 'string') {
      return { renderFailed: sanitizeDetail(outcome?.error ?? pageErrors[0] ?? 'no image was produced') };
    }
    const prefix = 'data:image/png;base64,';
    if (!outcome.png.startsWith(prefix)) return { renderFailed: 'canvas data is not a PNG data URL' };
    return decodePng(Buffer.from(outcome.png.slice(prefix.length), 'base64'));
  } catch (err) {
    return { renderFailed: describe(err) };
  } finally {
    await page?.close().catch(() => undefined);
  }
}

/**
 * One Chromium launch, one page per frame (ascending). Never throws: a launch failure
 * or a per-frame error becomes `{ renderFailed }` for the affected frames.
 */
export async function renderFrames(
  distDir: string,
  frames: readonly number[],
  stage: { width: number; height: number },
): Promise<Map<number, RenderedFrame>> {
  const result = new Map<number, RenderedFrame>();
  const ordered = [...frames].sort((a, b) => a - b);
  if (ordered.length === 0) return result;
  const root = path.resolve(distDir);
  let browser: Browser | null = null;
  let closing: Promise<void> | null = null;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      const detail = describe(err);
      for (const n of ordered) result.set(n, { renderFailed: detail });
      return result;
    }
    const context = await browser.newContext({
      viewport: { width: stage.width, height: stage.height },
      deviceScaleFactor: 1,
    });
    for (const n of ordered) result.set(n, await renderOne(context, root, n));
    return result;
  } catch (err) {
    const detail = describe(err);
    for (const n of ordered) if (!result.has(n)) result.set(n, { renderFailed: detail });
    return result;
  } finally {
    if (browser) {
      closing = browser.close().catch(() => undefined);
      await closing;
    }
  }
}
