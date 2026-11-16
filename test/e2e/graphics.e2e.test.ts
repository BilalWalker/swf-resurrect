// Code-drawn graphics through the real PixiBackend in headless Chromium (as3-coverage task 15.2, Requirements 14.7,
// 14.8): a generated project whose root class draws a filled circle and a stroked path; the screenshot is read back.
// Skipped with a reason when Chromium is missing. Validates: Requirements 14.5, 14.7, 14.8
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
const ORIGIN = 'http://graphics.local';
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
  stage: { width: 120, height: 100, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': {
      type: 'sprite', className: 'Gfx', frameCount: 1, labels: [],
      frames: [[{ depth: 1, symbolId: 1, matrix: m, colorTransform: ct, name: '' }]],
    },
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 20, height: 20 } },
  },
};
const SHAPE_JSON =
  '{"formatVersion":1,"paths":[{"contours":[{"outer":[["M",0,0],["L",20,0],["L",20,20],["L",0,20],["Z"]],"holes":[]}],"fill":{"kind":"solid","color":"#ff0000","alpha":1},"stroke":null}]}\n';
const GFX_CLASS: TranslatedClass = {
  className: 'Gfx',
  fileName: 'Gfx.ts',
  text: `import { MovieClip, Sprite } from '../shim';
export class Gfx extends MovieClip {
  constructor() {
    super();
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
describe.skipIf(reason !== null)(`code-drawn graphics${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
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
    if (tempRoot === '') tempRoot = await mkdtemp(resolve(repoRoot, '.work', 'graphics-'));
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
    'draws below a child, scales the line with the sprite, and keeps an open stroke open',
    async () => {
      const built = await build('gfx', GFX_CLASS);
      launched ??= await launchChromium();
      const context = await launched.browser.newContext({ viewport: { width: 120, height: 100 }, deviceScaleFactor: 1 });
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
      let img: RgbaImage;
      try {
        // The full page (not ?timelineOnly, which plays without the class registry) so the root class draws.
        await page.goto(`${ORIGIN}/index.html`);
        const canvas = page.locator('canvas');
        await canvas.waitFor({ timeout: 15_000 });
        await page.waitForTimeout(500);
        img = decodePng(await canvas.screenshot());
      } finally {
        await context.close();
      }
      expect(errors).toEqual([]);
      const px = (x: number, y: number): [number, number, number] => {
        const o = (y * img.width + x) * 4;
        return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!];
      };
      const is = (p: [number, number, number], c: [number, number, number]): boolean => p.every((v, i) => Math.abs(v - c[i]!) <= 8);
      // The filled circle (centre 20,20, radius 25) is blue; the red square child (0..20) is drawn above it.
      expect(is(px(35, 35), [0, 0, 255])).toBe(true);
      expect(is(px(10, 10), [255, 0, 0])).toBe(true);
      // Open stroked path, 6 wide, round caps: green across rows 57..63, white above.
      expect(is(px(50, 60), [0, 255, 0])).toBe(true);
      expect(is(px(50, 58), [0, 255, 0])).toBe(true);
      expect(is(px(50, 52), [255, 255, 255])).toBe(true);
      // A 4 pixel line in a sprite scaled by 2 is 8 pixels thick (rows 76..83), not 4 (rows 78..81): rows 77 and 83 are black.
      expect(is(px(50, 77), [0, 0, 0])).toBe(true);
      expect(is(px(50, 83), [0, 0, 0])).toBe(true);
      expect(is(px(50, 72), [255, 255, 255])).toBe(true);
      expect(is(px(50, 86), [255, 255, 255])).toBe(true);
    },
    TIMEOUT_MS,
  );
});