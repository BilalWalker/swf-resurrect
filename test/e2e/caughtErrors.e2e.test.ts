// An Emitted_Project whose root class throws in its constructor still draws its timeline frame in headless
// Chromium and logs one console.error with the Error_Site; a missing scene still shows "Startup failed"
// (breadth task 22.4, design 21.3). Skipped with a reason when Chromium is missing.
// Validates: Requirements 25.5, 25.6, 31.3
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { emit } from '../../src/emit/emit';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import { buildProject, type BuiltProject } from '../../src/verify/edge/buildProject';
import { decodePng } from '../../src/verify/edge/png';
import type { SceneJson } from '../../template/runtime/scene';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'http://caught.local';

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
const TIMEOUT_MS = 5 * 60 * 1000;

const m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
const ct: [number, number, number, number, number, number, number, number] = [1, 1, 1, 1, 0, 0, 0, 0];
const sprite = (frames: number[], className?: string) => ({
  type: 'sprite' as const,
  ...(className === undefined ? {} : { className }),
  frameCount: 1,
  labels: [],
  frames: [frames.map((id, i) => ({ depth: i + 1, symbolId: id, matrix: m, colorTransform: ct, name: '' }))],
});
const scene: SceneJson = {
  formatVersion: 2,
  stage: { width: 60, height: 40, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': sprite([2], 'Thrower'),
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 20, height: 20 } },
    '2': sprite([1]),
  },
};
const SHAPE_JSON =
  '{"formatVersion":1,"paths":[{"contours":[{"outer":[["M",0,0],["L",20,0],["L",20,20],["L",0,20],["Z"]],"holes":[]}],"fill":{"kind":"solid","color":"#ff0000","alpha":1},"stroke":null}]}\n';

const thrower: TranslatedClass = {
  className: 'Thrower',
  fileName: 'Thrower.ts',
  text: "import { MovieClip } from '../shim';\nexport class Thrower extends MovieClip {\n  constructor() {\n    super();\n    throw new Error('boom');\n  }\n}\n",
  diagnostics: [],
  spans: [],
  extendsName: null,
  extendsQualified: null,
  importRecords: [],
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

describe.skipIf(reason !== null)(`browser boot with a throwing root class${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  let tempRoot = '';
  let built: BuiltProject | null = null;
  let browser: Browser | null = null;
  afterAll(async () => {
    await browser?.close().catch(() => undefined);
    await built?.dispose();
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  async function open(missingScene: boolean) {
    if (built === null) {
      await mkdir(resolve(repoRoot, '.work'), { recursive: true });
      tempRoot = await mkdtemp(resolve(repoRoot, '.work', 'caught-errors-'));
      const staging = join(tempRoot, 'staging');
      await mkdir(join(staging, 'assets'), { recursive: true });
      const svg = join(staging, 'assets', '1.shape.json');
      await writeFile(svg, SHAPE_JSON);
      const scenePath = join(staging, 'assets', 'scene.json');
      await writeFile(scenePath, JSON.stringify(scene));
      const result = await emit(
        { stagingDir: staging, scenePath, shapePaths: [svg], imagePaths: [], scene, unsupported: [], stats: { svgWritten: 1, morphSkipped: 0, declaredShapes: 1 } },
        {
          outputDir: join(tempRoot, 'project'),
          force: false,
          swfPath: join(staging, 'x.swf'),
          cwd: repoRoot,
          homeDir: tempRoot,
          templateDir: resolve(repoRoot, 'template'),
          translated: [thrower],
          handwrittenDir: null,
          gate: (files) => typeCheckProject({ files, repoRoot }),
        },
      );
      built = await buildProject(result.outputDir);
      browser = await chromium.launch({ headless: true });
    }
    const distDir = built.distDir;
    const context = await browser!.newContext({ viewport: { width: 60, height: 40 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (c) => {
      if (c.type() === 'error') errors.push(c.text());
    });
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (missingScene && rel.endsWith('scene.json')) return route.fulfill({ status: 404, body: 'not found' });
      const mime = MIME[extname(rel).toLowerCase()];
      try {
        if (mime === undefined || rel.includes('..')) throw new Error('nope');
        await route.fulfill({ status: 200, contentType: mime, body: await readFile(join(distDir, rel)) });
      } catch {
        await route.fulfill({ status: 404, body: 'not found' });
      }
    });
    await page.goto(`${ORIGIN}/index.html`);
    return { page, errors, close: () => context.close() };
  }

  it(
    'draws the timeline frame, shows no Startup failed, and logs one console.error with the Error_Site',
    async () => {
      const { page, errors, close } = await open(false);
      try {
        await page.waitForSelector('canvas');
        await page.waitForTimeout(500);
        const png = await decodePng(await page.locator('canvas').screenshot());
        let red = 0;
        for (let i = 0; i < png.data.length; i += 4) {
          if (png.data[i] > 200 && png.data[i + 1] < 60 && png.data[i + 2] < 60) red++;
        }
        expect(red).toBeGreaterThan(0); // the child shape is drawn, not the background colour only
        expect(await page.locator('#swf-resurrect-error').count()).toBe(0);
        const mine = errors.filter((e) => e.includes('[SWF Resurrect]'));
        expect(mine).toEqual(['[SWF Resurrect] constructor Thrower: boom']);
      } finally {
        await close();
      }
    },
    TIMEOUT_MS,
  );

  it(
    'a missing scene still shows Startup failed in an alert',
    async () => {
      const { page, close } = await open(true);
      try {
        const alert = page.locator('#swf-resurrect-error');
        await alert.waitFor();
        expect(await alert.getAttribute('role')).toBe('alert');
        expect(await alert.textContent()).toMatch(/^Startup failed: Scene_JSON failed to load/);
      } finally {
        await close();
      }
    },
    TIMEOUT_MS,
  );
});
