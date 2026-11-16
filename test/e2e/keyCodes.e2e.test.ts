// Browser key codes against Flash key codes for the 14 keys the two games read (as3-coverage task 8.4,
// Requirement 5.10). Real key presses in headless Chromium; skipped with a reason when Chromium is missing.
// A US layout only: other layouts are Open_Item O7.
// Validates: Requirements 5.8, 5.10
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { flashKeyCode } from '../../template/runtime/keyMap';
import { holdPipelineSlot } from '../support/holdPipelineSlot';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';

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

// [Playwright key name, Flash key code]
const KEYS: ReadonlyArray<[string, number]> = [
  ['Enter', 13], ['Escape', 27], ['Space', 32],
  ['ArrowLeft', 37], ['ArrowUp', 38], ['ArrowRight', 39], ['ArrowDown', 40],
  ['KeyA', 65], ['KeyC', 67], ['KeyD', 68], ['KeyS', 83], ['KeyW', 87], ['KeyX', 88], ['KeyZ', 90],
];

describe.skipIf(reason !== null)(`browser key codes equal Flash key codes${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  holdPipelineSlot();
  let launched: LaunchedChromium | null = null;
  afterAll(async () => {
    await launched?.stop();
  }, 60_000);

  it('keyCode and flashKeyCode equal the table for all 14 required keys', async () => {
    launched = await launchChromium();
    const context = await launched.browser.newContext();
    const page = await context.newPage();
    await page.setContent('<body><script>window.seen=[];addEventListener("keydown",e=>seen.push({code:e.code,keyCode:e.keyCode}))</script></body>');
    for (const [name] of KEYS) await page.keyboard.press(name);
    const seen = await page.evaluate(() => (globalThis as unknown as { seen: Array<{ code: string; keyCode: number }> }).seen);
    await context.close();
    expect(seen.length).toBe(KEYS.length);
    KEYS.forEach(([name, flash], i) => {
      expect(seen[i]!.keyCode, `${name} browser keyCode`).toBe(flash);
      expect(flashKeyCode(seen[i]!), `${name} flashKeyCode`).toBe(flash);
    });
  }, 120_000);
});
