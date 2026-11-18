// Generated button fixture end to end (robustness task 23.1, Requirement 20.18). The SWF is made by FFDec -xml2swf
// (test/support/buttonSwf.ts), run through the pipeline, built, and loaded in headless Chromium with ?play=1. The class
// linked to the button is a hand-written override that records the mouse events it receives (no AS3 compiler here).
// Checks: up state at rest, over while hovering, down while pressed, `click` reaches a listener, and a point inside the
// hit area but outside the drawn state reacts. Skipped when Java or tools/ffdec is absent, or Chromium is missing.
// Validates: Requirements 20.4, 20.5, 20.6, 20.7, 20.9, 20.18, 20.19
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { buildProject } from '../../src/verify/edge/buildProject';
import { BUTTON_PLAY, buttonSwfSkipReason, writeButtonPlaySwf } from '../support/buttonSwf';
import { launchChromium } from '../support/launchChromium';
import { chromiumDriver } from '../support/playDriver';
import { PIPELINE_SLOTS, withSlot } from '../support/slots';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'http://button-fixture.local';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

const HANDWRITTEN_CLASS = `import { SimpleButton } from '../shim';

// Test double for the AS3 class a fixture would link: records the events the button receives.
export class ${BUTTON_PLAY.className} extends SimpleButton {
  constructor() {
    super();
    const log: string[] = ((globalThis as any).__btnEvents ??= []);
    for (const type of ['click', 'mouseOver', 'mouseOut', 'rollOver', 'rollOut', 'mouseDown', 'mouseUp']) {
      this.addEventListener(type, () => void log.push(type));
    }
  }
}
`;

function chromiumMissing(): boolean {
  try {
    const p = chromium.executablePath();
    return p === '' || !existsSync(p);
  } catch {
    return true;
  }
}

function runPipeline(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((res, rej) => {
    const tsx = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');
    const child = spawn(process.execPath, [tsx, 'src/pipeline/cli.ts', ...args], { cwd: repoRoot, windowsHide: true });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', rej);
    child.on('close', (code) => res({ code: code ?? 1, output }));
  });
}

const skip = buttonSwfSkipReason() ?? (chromiumMissing() ? 'Playwright Chromium is missing' : null);
if (skip !== null) console.warn(`buttonFixture: skipped: ${skip}`);

describe('generated button fixture (Chromium)', () => {
  it.skipIf(skip !== null)(
    'draws up at rest, over on hover, down on press; click and the hit area reach the listener',
    async () => {
      const work = resolve(repoRoot, '.work', 'button-fixture');
      await rm(work, { recursive: true, force: true });
      await mkdir(join(work, 'hw'), { recursive: true });
      try {
        const swf = join(work, 'button', 'button.swf');
        await mkdir(join(work, 'button'), { recursive: true });
        writeButtonPlaySwf(swf);
        await writeFile(join(work, 'hw', `${BUTTON_PLAY.className}.ts`), HANDWRITTEN_CLASS);
        const outDir = join(work, 'out');

        await withSlot('pipeline', PIPELINE_SLOTS, async () => {
          const run = await runPipeline([swf, outDir, '--force', '--handwritten', join(work, 'hw')]);
          expect(run.code, run.output).toBe(0);
          const built = await buildProject(outDir);
          const launched = await launchChromium();
          try {
            const context = await launched.browser.newContext({ viewport: { width: 400, height: 300 } });
            const page = await context.newPage();
            const pageErrors: string[] = [];
            page.on('pageerror', (e) => pageErrors.push(e.message));
            page.on('console', (m) => {
              if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
            });
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
            const play = chromiumDriver(page);
            const events = (): Promise<string[]> => page.evaluate(() => [...(((globalThis as any).__btnEvents as string[] | undefined) ?? [])]);
            /** The colour of a stage pixel after drawing once. */
            const colourAt = async (x: number, y: number): Promise<[number, number, number]> => {
              await play.render();
              const png = PNG.sync.read(await page.locator('canvas').screenshot());
              const k = (y * png.width + x) * 4;
              return [png.data[k]!, png.data[k + 1]!, png.data[k + 2]!];
            };
            const near = (a: readonly number[], b: readonly number[]): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= 24);
            const { origin, drawn, hit, colours } = BUTTON_PLAY;
            const inside = { x: origin.x + drawn.width / 2, y: origin.y + drawn.height / 2 };
            const hitOnly = { x: origin.x + drawn.width + (hit.width - drawn.width) / 2, y: inside.y };
            const away = { x: 270, y: 180 };
            const white = [255, 255, 255];

            // The button is on the root with its instance name.
            expect((await play.inspect()).find(BUTTON_PLAY.className).map((s) => s.name)).toEqual([BUTTON_PLAY.instanceName]);

            // Rest: up state; the hit-only strip is not drawn.
            await play.step(2);
            expect(near(await colourAt(inside.x, inside.y), colours.up)).toBe(true);
            expect(near(await colourAt(hitOnly.x, hitOnly.y), white)).toBe(true);

            // Hover: over state.
            await play.mouse('move', inside.x, inside.y);
            expect(near(await colourAt(inside.x, inside.y), colours.over)).toBe(true);
            // Press: down state.
            await play.mouse('down', inside.x, inside.y);
            expect(near(await colourAt(inside.x, inside.y), colours.down)).toBe(true);
            // Release: back to over, and click reaches the listener.
            await play.mouse('up', inside.x, inside.y);
            expect(near(await colourAt(inside.x, inside.y), colours.over)).toBe(true);
            let seen = await events();
            expect(seen).toContain('mouseDown');
            expect(seen).toContain('mouseUp');
            expect(seen.filter((e) => e === 'click')).toHaveLength(1);
            await page.locator('canvas').screenshot({ path: join(repoRoot, '.work', 'button-fixture-over.png') });

            // Leave: up state again.
            await play.mouse('move', away.x, away.y);
            expect(near(await colourAt(inside.x, inside.y), colours.up)).toBe(true);
            expect(await events()).toContain('mouseOut');

            // Hit area outside the drawn state: hover reacts (over drawn) and a click fires.
            await play.mouse('move', hitOnly.x, hitOnly.y);
            expect(near(await colourAt(inside.x, inside.y), colours.over)).toBe(true);
            await play.mouse('down', hitOnly.x, hitOnly.y);
            expect(near(await colourAt(inside.x, inside.y), colours.down)).toBe(true);
            await play.mouse('up', hitOnly.x, hitOnly.y);
            seen = await events();
            expect(seen.filter((e) => e === 'click')).toHaveLength(2);

            // A press and release outside both areas is no click.
            await play.mouse('move', away.x, away.y);
            await play.mouse('down', away.x, away.y);
            await play.mouse('up', away.x, away.y);
            expect((await events()).filter((e) => e === 'click')).toHaveLength(2);

            expect(await play.errors()).toEqual([]);
            expect(pageErrors).toEqual([]);
            await context.close();
          } finally {
            await launched.stop();
            await built.dispose();
          }
        });
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
    10 * 60 * 1000,
  );
});
