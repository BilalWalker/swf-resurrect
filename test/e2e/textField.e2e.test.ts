// A TextField through the real PixiBackend in headless Chromium (as3-coverage task 16.2, Requirements 15.5, 15.7): a\n// generated project whose root class creates a TextField; the screenshot shows red text pixels, the page measures\n// textWidth with canvas measureText, and a pointer click on the field bubbles to its parent.\n// Skipped with a reason when Chromium is missing. Validates: Requirements 14.5, 14.7, 14.8
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, relative, isAbsolute, resolve } from 'node:path';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';
import { decodePng } from '../../src/verify/edge/png';
import type { RgbaImage } from '../../src/verify/core/pixelDiff';
import { MIME } from '../../src/verify/edge/renderFrames';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { emit } from '../../src/emit/emit';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import { buildProject, type BuiltProject } from '../../src/verify/edge/buildProject';
import type { SceneJson } from '../../template/runtime/scene';
import { holdPipelineSlot } from '../support/holdPipelineSlot';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'http://textfield.local';
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
  stage: { width: 200, height: 60, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': {
      type: 'sprite', className: 'Gfx', frameCount: 1, labels: [],
      frames: [[]],
    },
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 20, height: 20 } },
  },
};
const SHAPE_JSON =
  '{"formatVersion":1,"paths":[{"contours":[{"outer":[["M",0,0],["L",20,0],["L",20,20],["L",0,20],["Z"]],"holes":[]}],"fill":{"kind":"solid","color":"#ff0000","alpha":1},"stroke":null}]}\n';
const GFX_CLASS: TranslatedClass = {
  className: 'Gfx',
  fileName: 'Gfx.ts',
  text: `import { MovieClip, Sprite, TextField, MouseEvent } from '../shim';
export class Gfx extends MovieClip {
  constructor() {
    super();
    const holder = new Sprite();
    const tf = new TextField();
    tf.x = 10;
    tf.y = 10;
    tf.width = 150;
    tf.height = 30;
    tf.textColor = 0xff0000;
    tf.text = 'WWWW MMMM';
    holder.addChild(tf);
    this.addChild(holder);
    const result: Record<string, unknown> = { textWidth: tf.textWidth, clicks: 0 };
    (globalThis as unknown as { __tf: unknown }).__tf = result;
    holder.addEventListener(MouseEvent.CLICK, (e) => {
      result.clicks = (result.clicks as number) + 1;
      result.targetIsField = e.target === tf;
      result.currentIsHolder = e.currentTarget === holder;
    });
  }
}
`,
  diagnostics: [],
  spans: [],
  extendsName: null,
  extendsQualified: null,
  importRecords: [],
};/** A request path inside the root, or null when it would escape it. */
function resolveInside(root: string, urlPath: string): string | null {
  const full = resolve(root, decodeURIComponent(urlPath).replace(/^\/+/, '') || 'index.html');
  const rel = relative(root, full);
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? null : full;
}
describe.skipIf(reason !== null)(`TextField in the browser${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  holdPipelineSlot();
  let tempRoot = '';
  const builds: BuiltProject[] = [];
  let launched: LaunchedChromium | null = null;
  afterAll(async () => {
    await launched?.stop();
    for (const b of builds) await b.dispose();
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  async function build(tag: string, cls: TranslatedClass): Promise<BuiltProject> {
    await mkdir(resolve(repoRoot, '.work'), { recursive: true });
    if (tempRoot === '') tempRoot = await mkdtemp(resolve(repoRoot, '.work', 'textfield-'));
    const staging = join(tempRoot, `${tag}-staging`);
    await mkdir(join(staging, 'assets'), { recursive: true });
    const shape = join(staging, 'assets', '1.shape.json');
    await writeFile(shape, SHAPE_JSON);
    const scenePath = join(staging, 'assets', 'scene.json');
    await writeFile(scenePath, JSON.stringify(scene));
    const result = await emit(
      { stagingDir: staging, scenePath, shapePaths: [shape], imagePaths: [], scene, unsupported: [], stats: { svgWritten: 1, morphSkipped: 0, declaredShapes: 1 } },
      {
        outputDir: join(tempRoot, `${tag}-project`),
        force: false,
        swfPath: join(staging, 'x.swf'),
        cwd: repoRoot,
        homeDir: tempRoot,
        templateDir: resolve(repoRoot, 'template'),
        translated: [cls],
        handwrittenDir: null,
        gate: (files) => typeCheckProject({ files, repoRoot }),
      },
    );
    const built = await buildProject(result.outputDir);
    builds.push(built);
    return built;
  }

  it(
    'draws red text, measures textWidth in the browser, and bubbles a click to the parent',
    async () => {
      const built = await build('gfx', GFX_CLASS);
      launched ??= await launchChromium();
      const context = await launched.browser.newContext({ viewport: { width: 200, height: 60 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(`${ORIGIN}/**`, async (route) => {
        const file = resolveInside(built.distDir, new URL(route.request().url()).pathname);
        const mime = file === null ? undefined : MIME[extname(file).toLowerCase()];
        if (file === null || mime === undefined) return route.fulfill({ status: 404, body: 'not found' });
        try {
          await route.fulfill({ status: 200, contentType: mime, body: await readFile(file) });
        } catch {
          await route.fulfill({ status: 404, body: 'not found' });
        }
      });
      type Probe = Record<string, unknown>;
      const probe = (): Promise<Probe> => page.evaluate(() => (globalThis as unknown as { __tf: Probe }).__tf);
      let img: RgbaImage;
      let first: Probe;
      let after: Probe;
      let expectedWidth = 0;
      try {
        // The full page (not ?timelineOnly, which plays without the class registry) so the root class draws.
        await page.goto(`${ORIGIN}/index.html`);
        const canvas = page.locator('canvas');
        await canvas.waitFor({ timeout: 15_000 });
        await page.waitForTimeout(500);
        img = decodePng(await canvas.screenshot());
        first = await probe();
        expectedWidth = await page.evaluate(() => {
          const c = document.createElement('canvas').getContext('2d')!;
          c.font = '12px "Times New Roman"';
          return c.measureText('WWWW MMMM').width;
        });
        const box = (await canvas.boundingBox())!;
        await page.mouse.click(box.x + 30, box.y + 20);
        await page.waitForTimeout(200);
        after = await probe();
      } finally {
        await context.close();
      }
      expect(errors).toEqual([]);
      // Red glyph pixels inside the box (x 10..160, y 10..40) and none outside it.
      let red = 0;
      let redOutside = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const o = (y * img.width + x) * 4;
          const isRed = img.data[o]! > 200 && img.data[o + 1]! < 80 && img.data[o + 2]! < 80;
          if (!isRed) continue;
          if (x >= 10 && x <= 160 && y >= 10 && y <= 40) red++;
          else redOutside++;
        }
      }
      expect(red).toBeGreaterThan(40);
      expect(redOutside).toBe(0);
      // textWidth is the browser's canvas measureText of the text, valid in the same call as the text.
      expect(first.textWidth as number).toBeGreaterThan(30);
      expect(first.textWidth as number).toBeCloseTo(expectedWidth, 3);
      // Kept for the commit message: the measured numbers of this run (the .work directory is not committed).
      await writeFile(resolve(repoRoot, '.work', 'textfield-e2e.json'), JSON.stringify({ textWidth: first.textWidth, expectedWidth, redPixels: red, afterClick: after }));
      // The click on the field reaches the parent's listener with target = the field.
      expect([after.clicks, after.targetIsField, after.currentIsHolder]).toEqual([1, true, true]);
    },
    TIMEOUT_MS,
  );
});