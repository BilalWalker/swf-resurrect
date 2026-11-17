// Four browser checks on ONE generated project and one Chromium (as3-coverage tasks 8.3, 14.7, 15.2, 16.2; merged in
// Checkpoint 2 step 1b to save three emits, type-check gates, Vite builds and browser launches). The root class `Probe`
// picks its behaviour from `?case=`, so each check loads its own page of the same build:
//   gfx      code-drawn graphics below a timeline child, a scaled line, an open stroke (Requirements 14.5, 14.7, 14.8)
//   text     a TextField: red glyphs, textWidth measured in the browser, a click bubbling to the parent (15.5, 15.7)
//   stage    keys with no click, and a Stage child that is drawn and receives a click (5.1, 5.2, 5.3, 5.5)
//   iframe   keys inside a sandboxed <iframe> after a click in the frame, no iframe.focus() by the host (5.7)
// The timeline places a red 20 x 20 square at 0,0 under the root class's drawing in every case. The page is ready when
// the class has run and two animation frames have passed; there are no sleeps.
// Skipped with a reason when Chromium is missing.
// Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.7, 14.5, 14.7, 14.8, 15.5, 15.7
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emit } from '../../src/emit/emit';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import { buildProject, type BuiltProject } from '../../src/verify/edge/buildProject';
import { MIME } from '../../src/verify/edge/renderFrames';
import type { SceneJson } from '../../template/runtime/scene';
import { holdPipelineSlot } from '../support/holdPipelineSlot';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'http://probe.local';
const TIMEOUT_MS = 5 * 60 * 1000;
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
const m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
const ct: [number, number, number, number, number, number, number, number] = [1, 1, 1, 1, 0, 0, 0, 0];
const scene: SceneJson = {
  formatVersion: 2,
  stage: { width: 200, height: 100, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': {
      type: 'sprite', className: 'Probe', frameCount: 1, labels: [],
      frames: [[{ depth: 1, symbolId: 1, matrix: m, colorTransform: ct, name: '' }]],
    },
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 20, height: 20 } },
  },
};
const SHAPE_JSON =
  '{"formatVersion":1,"paths":[{"contours":[{"outer":[["M",0,0],["L",20,0],["L",20,20],["L",0,20],["Z"]],"holes":[]}],"fill":{"kind":"solid","color":"#ff0000","alpha":1},"stroke":null}]}\n';
const PROBE_CLASS: TranslatedClass = {
  className: 'Probe',
  fileName: 'Probe.ts',
  text: `import { MovieClip, Sprite, TextField, MouseEvent } from '../shim';
const g = globalThis as any;
export class Probe extends MovieClip {
  constructor() {
    super();
    const which = new URLSearchParams(location.search).get('case');
    if (which === 'gfx') this.gfx();
    else if (which === 'text') this.text();
    else if (which === 'stage' || which === 'iframe') this.keys(which === 'stage');
    g.__probeDone = true;
  }
  gfx(): void {
    this.graphics.beginFill(0x0000ff);
    this.graphics.drawCircle(20, 20, 25);
    this.graphics.endFill();
    this.graphics.lineStyle(6, 0x00ff00);
    this.graphics.drawPath([1, 2], [5, 60, 95, 60]);
    const s = new Sprite();
    s.graphics.lineStyle(4, 0x000000);
    s.graphics.moveTo(0, 0);
    s.graphics.lineTo(40, 0);
    s.x = 10;
    s.y = 80;
    s.scaleX = 2;
    s.scaleY = 2;
    this.addChild(s);
  }
  text(): void {
    const holder = new Sprite();
    const tf = new TextField();
    tf.x = 10;
    tf.y = 30;
    tf.width = 150;
    tf.height = 30;
    tf.textColor = 0xff0000;
    tf.text = 'WWWW MMMM';
    holder.addChild(tf);
    this.addChild(holder);
    const result: Record<string, unknown> = { textWidth: tf.textWidth, clicks: 0 };
    g.__tf = result;
    holder.addEventListener(MouseEvent.CLICK, (e) => {
      result.clicks = (result.clicks as number) + 1;
      result.targetIsField = e.target === tf;
      result.currentIsHolder = e.currentTarget === holder;
    });
  }
  keys(withStageChildren: boolean): void {
    this.addEventListener('addedToStage', () => {
      const log: string[] = (g.__keys = []);
      for (const t of ['keyDown', 'keyUp']) this.stage!.addEventListener(t, (e: any) => log.push(t + ':' + e.keyCode));
      if (!withStageChildren) return;
      const box = new Sprite();
      box.graphics.beginFill(0x0000ff);
      box.graphics.moveTo(0, 0);
      box.graphics.lineTo(20, 0);
      box.graphics.lineTo(20, 20);
      box.graphics.lineTo(0, 20);
      box.graphics.lineTo(0, 0);
      box.graphics.endFill();
      box.x = 70;
      box.y = 50;
      g.__clicks = 0;
      box.addEventListener('click', () => (g.__clicks += 1));
      this.stage!.addChild(box);
      const label = new TextField();
      label.text = 'hi';
      label.x = 5;
      label.y = 50;
      this.stage!.addChild(label);
      g.__stageKids = this.stage!.numChildren;
    });
  }
}
`,
  diagnostics: [],
  spans: [],
  extendsName: null,
  extendsQualified: null,
  importRecords: [],
};
/** A request path inside the root, or null when it would escape it. */
function resolveInside(root: string, urlPath: string): string | null {
  const full = resolve(root, decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html');
  const rel = relative(root, full);
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : full;
}
describe.skipIf(reason !== null)(`generated project in one browser${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  holdPipelineSlot();
  let tempRoot = '';
  let built: BuiltProject | null = null;
  let launched: LaunchedChromium | null = null;
  afterAll(async () => {
    await launched?.stop();
    await built?.dispose();
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);
  beforeAll(async () => {
    await mkdir(resolve(repoRoot, '.work'), { recursive: true });
    tempRoot = await mkdtemp(resolve(repoRoot, '.work', 'probe-'));
    const staging = join(tempRoot, 'staging');
    await mkdir(join(staging, 'assets'), { recursive: true });
    const shape = join(staging, 'assets', '1.shape.json');
    await writeFile(shape, SHAPE_JSON);
    const scenePath = join(staging, 'assets', 'scene.json');
    await writeFile(scenePath, JSON.stringify(scene));
    const result = await emit(
      { stagingDir: staging, scenePath, shapePaths: [shape], imagePaths: [], scene, unsupported: [], stats: { svgWritten: 1, morphSkipped: 0, declaredShapes: 1 } },
      {
        outputDir: join(tempRoot, 'project'),
        force: false,
        swfPath: join(staging, 'x.swf'),
        cwd: repoRoot,
        homeDir: tempRoot,
        templateDir: resolve(repoRoot, 'template'),
        translated: [PROBE_CLASS],
        handwrittenDir: null,
        gate: (files) => typeCheckProject({ files, repoRoot }),
      },
    );
    built = await buildProject(result.outputDir);
    launched = await launchChromium();
  }, TIMEOUT_MS);

  /** A fresh page of the built project: serves dist (plus a host page when given), collects page errors. */
  async function open(viewport: { width: number; height: number }, hostHtml?: string): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
    const context = await launched!.browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    const dist = built!.distDir;
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const headers = { 'access-control-allow-origin': '*' };
      if (hostHtml !== undefined && url.pathname === '/host.html') {
        return route.fulfill({ status: 200, headers, contentType: MIME['.html']!, body: hostHtml });
      }
      const file = resolveInside(dist, hostHtml === undefined ? url.pathname : url.pathname.replace(/^\/game\//, ''));
      const mime = file === null ? undefined : MIME[extname(file).toLowerCase()];
      if (file === null || mime === undefined) return route.fulfill({ status: 404, body: 'not found' });
      try {
        await route.fulfill({ status: 200, headers, contentType: mime, body: await readFile(file) });
      } catch {
        await route.fulfill({ status: 404, body: 'not found' });
      }
    });
    return { page, errors, close: () => context.close() };
  }
  /** Waits until the root class has run and the renderer has had two animation frames. */
  async function ready(page: Page): Promise<void> {
    await page.waitForFunction(() => (globalThis as unknown as { __probeDone?: boolean }).__probeDone === true, undefined, { timeout: 30_000 });
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  }
  const pixels = (png: Buffer): { width: number; height: number; px: (x: number, y: number) => number[] } => {
    const shot = PNG.sync.read(png);
    return { width: shot.width, height: shot.height, px: (x, y) => [...shot.data.subarray((y * shot.width + x) * 4, (y * shot.width + x) * 4 + 3)] };
  };
  const near = (p: number[], c: number[]): boolean => p.every((v, i) => Math.abs(v - c[i]!) <= 8);

  it(
    'gfx: draws below a child, scales the line with the sprite, and keeps an open stroke open',
    async () => {
      const { page, errors, close } = await open({ width: 200, height: 100 });
      let img: ReturnType<typeof pixels>;
      try {
        await page.goto(`${ORIGIN}/index.html?case=gfx`);
        await page.locator('canvas').waitFor({ timeout: 15_000 });
        await ready(page);
        img = pixels(await page.locator('canvas').screenshot());
      } finally {
        await close();
      }
      expect(errors).toEqual([]);
      // The filled circle (centre 20,20, radius 25) is blue; the red square child (0..20) is drawn above it.
      expect(near(img.px(35, 35), [0, 0, 255])).toBe(true);
      expect(near(img.px(10, 10), [255, 0, 0])).toBe(true);
      // Open stroked path, 6 wide, round caps: green across rows 57..63, white above.
      expect(near(img.px(50, 60), [0, 255, 0])).toBe(true);
      expect(near(img.px(50, 58), [0, 255, 0])).toBe(true);
      expect(near(img.px(50, 52), [255, 255, 255])).toBe(true);
      // A 4 pixel line in a sprite scaled by 2 is 8 pixels thick (rows 76..83), not 4 (rows 78..81): rows 77 and 83 are black.
      expect(near(img.px(50, 77), [0, 0, 0])).toBe(true);
      expect(near(img.px(50, 83), [0, 0, 0])).toBe(true);
      expect(near(img.px(50, 72), [255, 255, 255])).toBe(true);
      expect(near(img.px(50, 86), [255, 255, 255])).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    'text: draws red text, measures textWidth in the browser, and bubbles a click to the parent',
    async () => {
      const { page, errors, close } = await open({ width: 200, height: 100 });
      type Probe = Record<string, unknown>;
      const probe = (): Promise<Probe> => page.evaluate(() => (globalThis as unknown as { __tf: Probe }).__tf);
      let shot: Buffer;
      let first: Probe;
      let after: Probe;
      let expectedWidth = 0;
      try {
        await page.goto(`${ORIGIN}/index.html?case=text`);
        const canvas = page.locator('canvas');
        await canvas.waitFor({ timeout: 15_000 });
        await ready(page);
        shot = await canvas.screenshot();
        first = await probe();
        expectedWidth = await page.evaluate(() => {
          const c = document.createElement('canvas').getContext('2d')!;
          c.font = '12px "Times New Roman"';
          return c.measureText('WWWW MMMM').width;
        });
        const box = (await canvas.boundingBox())!;
        await page.mouse.click(box.x + 30, box.y + 40);
        await page.waitForFunction(() => (globalThis as unknown as { __tf: { clicks: number } }).__tf.clicks >= 1, undefined, { timeout: 10_000 });
        after = await probe();
      } finally {
        await close();
      }
      expect(errors).toEqual([]);
      // The timeline square (0..20 x 0..20) is red too, so it is skipped. Red glyph pixels inside the field's box
      // (x 10..160, y 30..60) and none elsewhere.
      const png = PNG.sync.read(shot);
      let red = 0;
      let redOutside = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          if (x < 20 && y < 20) continue;
          const o = (y * png.width + x) * 4;
          const isRed = png.data[o]! > 200 && png.data[o + 1]! < 80 && png.data[o + 2]! < 80;
          if (!isRed) continue;
          if (x >= 10 && x <= 160 && y >= 30 && y <= 60) red++;
          else redOutside++;
        }
      }
      expect(red).toBeGreaterThan(40);
      expect(redOutside).toBe(0);
      // textWidth is the browser's canvas measureText of the text, valid in the same call as the text.
      expect(first.textWidth as number).toBeGreaterThan(30);
      expect(first.textWidth as number).toBeCloseTo(expectedWidth, 3);
      // The click on the field reaches the parent's listener with target = the field.
      expect([after.clicks, after.targetIsField, after.currentIsHolder]).toEqual([1, true, true]);
    },
    TIMEOUT_MS,
  );

  it(
    'stage: delivers keys with no click, draws a Stage child and sends it a click',
    async () => {
      const { page, errors, close } = await open({ width: 200, height: 100 });
      let keys: string[];
      let kids: number;
      let boxPixel: number[];
      let rootPixel: number[];
      let clicks: number;
      let clicksAfterRoot: number;
      try {
        await page.goto(`${ORIGIN}/index.html?case=stage`);
        await page.locator('canvas').waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => Array.isArray((globalThis as unknown as { __keys?: unknown }).__keys), undefined, { timeout: 30_000 });
        await ready(page);
        // (1) Keys with no pointer click first.
        await page.keyboard.press('KeyA');
        await page.keyboard.press('ArrowLeft');
        keys = await page.evaluate(() => (globalThis as unknown as { __keys: string[] }).__keys);
        // (2) The Stage child (a blue 20 x 20 box at 70,50) is drawn and receives a click; the Stage TextField exists.
        kids = await page.evaluate(() => (globalThis as unknown as { __stageKids: number }).__stageKids);
        const shot = pixels(await page.screenshot());
        boxPixel = shot.px(80, 60);
        rootPixel = shot.px(10, 10);
        const count = (): Promise<number> => page.evaluate(() => (globalThis as unknown as { __clicks: number }).__clicks);
        await page.mouse.click(80, 60);
        await page.waitForFunction(() => (globalThis as unknown as { __clicks: number }).__clicks >= 1, undefined, { timeout: 10_000 });
        clicks = await count();
        await page.mouse.click(10, 10); // the root clip: not the Stage child, so no click on the box
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        clicksAfterRoot = await count();
      } finally {
        await close();
      }
      expect(errors).toEqual([]);
      expect(kids).toBe(3);
      expect(boxPixel).toEqual([0, 0, 255]);
      expect(rootPixel).toEqual([255, 0, 0]);
      // A Stage child drawn only with Sprite.graphics is a hit target on its fills; the root click leaves the count at 1.
      expect(clicks).toBe(1);
      expect(clicksAfterRoot).toBe(1);
      expect(keys).toEqual(['keyDown:65', 'keyUp:65', 'keyDown:37', 'keyUp:37']);
    },
    TIMEOUT_MS,
  );

  it(
    'iframe: receives keyDown and keyUp after a click in the frame, with no iframe.focus() from the host',
    async () => {
      // sandbox="allow-scripts", as in the web UI; the host never calls iframe.focus().
      const host = '<body><iframe sandbox="allow-scripts" src="/game/index.html?case=iframe" width="200" height="100"></iframe></body>';
      const { page, close } = await open({ width: 300, height: 200 }, host);
      let keys: string[];
      try {
        await page.goto(`${ORIGIN}/host.html`);
        const frame = page.frameLocator('iframe');
        await frame.locator('canvas').waitFor({ timeout: 30_000 });
        const child = page.frames().find((f) => f !== page.mainFrame())!;
        await child.waitForFunction(() => Array.isArray((globalThis as unknown as { __keys?: unknown }).__keys), undefined, { timeout: 30_000 });
        await frame.locator('canvas').click();
        await page.keyboard.press('KeyA');
        await page.keyboard.press('ArrowLeft');
        keys = await child.evaluate(() => (globalThis as unknown as { __keys: string[] }).__keys);
      } finally {
        await close();
      }
      expect(keys).toEqual(['keyDown:65', 'keyUp:65', 'keyDown:37', 'keyUp:37']);
    },
    TIMEOUT_MS,
  );
});
