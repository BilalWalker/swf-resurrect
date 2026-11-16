// stop() of the Chromium launcher (task 29.1): it ends the browser and leaves no process of it behind.
// Skipped with a reason when Chromium is missing.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { GRACEFUL_CLOSE_MS } from '../../src/verify/edge/launchChromium';
import { launchChromium } from '../support/launchChromium';
import { alivePids, processTree } from '../support/processTree';

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

describe.skipIf(reason !== null)(`launchChromium stop${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  it('leaves no process of the browser alive, and the page was usable before', async () => {
    const launched = await launchChromium();
    const page = await launched.browser.newPage();
    await page.setContent('<p>x</p>');
    expect(await page.textContent('p')).toBe('x');
    const before = await processTree(launched.pid);
    expect(before.length, 'Chromium has helper processes besides the main one').toBeGreaterThan(1);
    const started = Date.now();
    await launched.stop();
    expect(Date.now() - started).toBeLessThan(GRACEFUL_CLOSE_MS + 15_000);
    expect(await alivePids(before)).toEqual([]);
    await launched.stop(); // twice is safe
  }, 20_000);

  it('kills a browser whose graceful close does not finish', async () => {
    const launched = await launchChromium();
    const page = await launched.browser.newPage();
    await page.setContent('<p>x</p>');
    const before = await processTree(launched.pid);
    // Make the graceful step hang: the connection close never settles.
    const original = launched.browser.close.bind(launched.browser);
    launched.browser.close = () => new Promise<void>(() => undefined);
    await launched.stop();
    launched.browser.close = original;
    expect(await alivePids(before)).toEqual([]);
  }, 20_000);
});
