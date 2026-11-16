// A module that throws while it is imported reports its error through window.__swfResurrect instead of ending as a
// render timeout (as3-coverage task 5.3, Requirements 37.7, 37.8). Skipped with a reason when Chromium is missing.
// Validates: Requirements 37.7, 37.8
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { emit } from '../../src/emit/emit';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import { buildProject, type BuiltProject } from '../../src/verify/edge/buildProject';
import { renderFrames } from '../../src/verify/edge/renderFrames';
import type { SceneJson } from '../../template/runtime/scene';
import { holdPipelineSlot } from '../support/holdPipelineSlot';
import { launchChromium, type LaunchedChromium } from '../support/launchChromium';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'http://loaderror.local';
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
  stage: { width: 60, height: 40, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': {
      type: 'sprite', className: 'Boom', frameCount: 1, labels: [],
      frames: [[{ depth: 1, symbolId: 1, matrix: m, colorTransform: ct, name: '' }]],
    },
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 20, height: 20 } },
  },
};
const SHAPE_JSON =
  '{"formatVersion":1,"paths":[{"contours":[{"outer":[["M",0,0],["L",20,0],["L",20,20],["L",0,20],["Z"]],"holes":[]}],"fill":{"kind":"solid","color":"#ff0000","alpha":1},"stroke":null}]}\n';
const boom = (body: string): TranslatedClass => ({
  className: 'Boom',
  fileName: 'Boom.ts',
  text: `import { MovieClip } from '../shim';\nexport class Boom extends MovieClip {\n}\n${body}`,
  diagnostics: [],
  spans: [],
  extendsName: null,
  extendsQualified: null,
  importRecords: [],
});
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

describe.skipIf(reason !== null)(`load-error listener${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
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
    if (tempRoot === '') tempRoot = await mkdtemp(resolve(repoRoot, '.work', 'load-error-'));
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

  async function outcomeOf(built: BuiltProject): Promise<unknown> {
    launched ??= await launchChromium();
    const context = await launched.browser.newContext({ viewport: { width: 60, height: 40 } });
    const page = await context.newPage();
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const mime = MIME[extname(rel).toLowerCase()];
      try {
        if (mime === undefined || rel.includes('..')) throw new Error('nope');
        await route.fulfill({ status: 200, contentType: mime, body: await readFile(join(built.distDir, rel)) });
      } catch {
        await route.fulfill({ status: 404, body: 'not found' });
      }
    });
    try {
      await page.goto(`${ORIGIN}/index.html?timelineOnly=1`);
      await page.waitForFunction(() => {
        const o = (globalThis as unknown as { __swfResurrect?: { ready?: boolean; error?: string } }).__swfResurrect;
        return Boolean(o && (o.ready || o.error));
      }, undefined, { timeout: 15_000 });
      return await page.evaluate(() => (globalThis as unknown as { __swfResurrect?: unknown }).__swfResurrect);
    } finally {
      await context.close();
    }
  }

  it(
    'a module that throws on import reports its error text and does not time out',
    async () => {
      const built = await build('throws', boom("throw new Error('import-time boom');\n"));
      const outcome = (await outcomeOf(built)) as { ready: boolean; error: string };
      expect(outcome.ready).toBe(false);
      expect(outcome.error).toContain('import-time boom');
      const frames = await renderFrames(built.distDir, [1], scene.stage);
      expect(JSON.stringify([...frames.values()])).toContain('import-time boom');
    },
    TIMEOUT_MS,
  );

  it(
    'a normal project is unchanged: ready is true and there is no error',
    async () => {
      const built = await build('fine', boom(''));
      const outcome = (await outcomeOf(built)) as { ready: boolean; error: string | null };
      expect(outcome.ready).toBe(true);
      expect(outcome.error).toBeNull();
    },
    TIMEOUT_MS,
  );
});
