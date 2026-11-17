// Measurements of task 20 (as3-coverage): key events reach an emitted page with no pointer click first, and a Stage child
// added by script is drawn and receives a click (Requirement 2, Requirement 5). Same tiny generated project as the iframe test.
// Skipped with a reason when Chromium is missing.
// Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.7
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import { emit } from '../../src/emit/emit';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import { buildProject, type BuiltProject } from '../../src/verify/edge/buildProject';
import type { SceneJson } from '../../template/runtime/scene';
import { holdPipelineSlot } from '../support/holdPipelineSlot';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'http://keys.local';
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
  stage: { width: 100, height: 80, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': {
      type: 'sprite', className: 'Keys', frameCount: 1, labels: [],
      frames: [[{ depth: 1, symbolId: 1, matrix: m, colorTransform: ct, name: '' }]],
    },
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 60, height: 40 } },
  },
};
const SHAPE_JSON =
  '{"formatVersion":1,"paths":[{"contours":[{"outer":[["M",0,0],["L",60,0],["L",60,40],["L",0,40],["Z"]],"holes":[]}],"fill":{"kind":"solid","color":"#ff0000","alpha":1},"stroke":null}]}\n';
const keysClass: TranslatedClass = {
  className: 'Keys',
  fileName: 'Keys.ts',
  text: [
    "import { MovieClip, Sprite, TextField } from '../shim';",
    'export class Keys extends MovieClip {',
    '  constructor() {',
    '    super();',
    "    this.addEventListener('addedToStage', () => {",
    '      const log: string[] = ((globalThis as any).__keys = []);',
    "      for (const t of ['keyDown', 'keyUp']) this.stage!.addEventListener(t, (e: any) => log.push(t + ':' + e.keyCode));",
    '      const box = new Sprite();',
    '      box.graphics.beginFill(0x0000ff);',
    '      box.graphics.moveTo(0, 0);',
    '      box.graphics.lineTo(20, 0);',
    '      box.graphics.lineTo(20, 20);',
    '      box.graphics.lineTo(0, 20);',
    '      box.graphics.lineTo(0, 0);',
    '      box.graphics.endFill();',
    '      box.x = 70;',
    '      box.y = 50;',
    '      (globalThis as any).__clicks = 0;',
    "      box.addEventListener('click', () => ((globalThis as any).__clicks += 1));",
    '      this.stage!.addChild(box);',
    '      const label = new TextField();',
    "      label.text = 'hi';",
    '      label.x = 5;',
    '      label.y = 50;',
    '      this.stage!.addChild(label);',
    "      (globalThis as any).__stageKids = this.stage!.numChildren;",
    '    });',
    '  }',
    '}',
    '',
  ].join('\n'),
  diagnostics: [],
  spans: [],
  extendsName: null,
  extendsQualified: null,
  importRecords: [],
};const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

describe.skipIf(reason !== null)(`keys without a click and a Stage child${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  holdPipelineSlot();
  let tempRoot = '';
  let built: BuiltProject | null = null;
  let launched: LaunchedChromium | null = null;
  afterAll(async () => {
    await launched?.stop();
    await built?.dispose();
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  async function build(): Promise<BuiltProject> {
    await mkdir(resolve(repoRoot, '.work'), { recursive: true });
    tempRoot = await mkdtemp(resolve(repoRoot, '.work', 'key-iframe-'));
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
        translated: [keysClass],
        handwrittenDir: null,
        gate: (files) => typeCheckProject({ files, repoRoot }),
      },
    );
    return buildProject(result.outputDir);
  }

  it(
    'measures key delivery with no click, and a Stage child that is drawn and receives a click',
    async () => {
      built = await build();
      launched = await launchChromium();
      const context = await launched.browser.newContext({ viewport: { width: 100, height: 80 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      const dist = built.distDir;
      await page.route(`${ORIGIN}/**`, async (route) => {
        const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\//, '') || 'index.html');
        const mime = MIME[extname(rel).toLowerCase()];
        try {
          if (mime === undefined || rel.includes('..')) throw new Error('nope');
          await route.fulfill({ status: 200, contentType: mime, body: await readFile(join(dist, rel)) });
        } catch {
          await route.fulfill({ status: 404, body: 'not found' });
        }
      });
      await page.goto(`${ORIGIN}/index.html`);
      await page.locator('canvas').waitFor({ timeout: 30_000 });
      await page.waitForFunction(() => Array.isArray((globalThis as unknown as { __keys?: unknown }).__keys), undefined, { timeout: 30_000 });
      // (1) Keys with no pointer click first.
      await page.keyboard.press('KeyA');
      await page.keyboard.press('ArrowLeft');
      const keys = await page.evaluate(() => (globalThis as unknown as { __keys: string[] }).__keys);
      // (2) The Stage child (a blue 20 x 20 box at 70,50) is drawn and receives a click; the Stage TextField exists.
      const kids = await page.evaluate(() => (globalThis as unknown as { __stageKids: number }).__stageKids);
      const shot = PNG.sync.read(await page.screenshot());
      const px = (x: number, y: number): number[] => [...shot.data.subarray((y * shot.width + x) * 4, (y * shot.width + x) * 4 + 3)];
      const boxPixel = px(80, 60);
      const rootPixel = px(30, 20);
      await page.mouse.click(80, 60);
      const clicks = await page.evaluate(() => (globalThis as unknown as { __clicks: number }).__clicks);
      await page.mouse.click(30, 20); // the root clip: not the Stage child, so no click on the box
      const clicksAfterRoot = await page.evaluate(() => (globalThis as unknown as { __clicks: number }).__clicks);
      await context.close();
      console.log(`MEASURED keys-without-click=${JSON.stringify(keys)} stageChildren=${kids} boxPixel=${boxPixel} rootPixel=${rootPixel} clicks=${clicks}/${clicksAfterRoot} errors=${JSON.stringify(errors)}`);
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
});