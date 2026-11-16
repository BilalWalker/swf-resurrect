// An emitted page inside a sandboxed <iframe> of a host page receives key events after a click in the frame
// (as3-coverage task 8.3, Requirement 5.7). The parent does not call iframe.focus(): the emitted page must work alone.
// Skipped with a reason when Chromium is missing.
// Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.7
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
  stage: { width: 60, height: 40, backgroundColor: '#ffffff', frameRate: 24 },
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
    "import { MovieClip } from '../shim';",
    'export class Keys extends MovieClip {',
    '  constructor() {',
    '    super();',
    "    this.addEventListener('addedToStage', () => {",
    '      const log: string[] = ((globalThis as any).__keys = []);',
    "      for (const t of ['keyDown', 'keyUp']) this.stage!.addEventListener(t, (e: any) => log.push(t + ':' + e.keyCode));",
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
};
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

describe.skipIf(reason !== null)(`keys inside an iframe${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
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
    'receives keyDown and keyUp after a click in the frame, with no iframe.focus() from the host',
    async () => {
      built = await build();
      launched = await launchChromium();
      const context = await launched.browser.newContext({ viewport: { width: 300, height: 200 } });
      const page = await context.newPage();
      const dist = built.distDir;
      await page.route(`${ORIGIN}/**`, async (route) => {
        const url = new URL(route.request().url());
        const headers = { 'access-control-allow-origin': '*' };
        if (url.pathname === '/host.html') {
          // sandbox="allow-scripts", as in the web UI; the host never calls iframe.focus().
          await route.fulfill({ status: 200, headers, contentType: MIME['.html']!, body: '<body><iframe sandbox="allow-scripts" src="/game/index.html" width="60" height="40"></iframe></body>' });
          return;
        }
        const rel = decodeURIComponent(url.pathname.replace(/^\/game\//, ''));
        const mime = MIME[extname(rel).toLowerCase()];
        try {
          if (mime === undefined || rel.includes('..')) throw new Error('nope');
          await route.fulfill({ status: 200, headers, contentType: mime, body: await readFile(join(dist, rel)) });
        } catch {
          await route.fulfill({ status: 404, body: 'not found' });
        }
      });
      await page.goto(`${ORIGIN}/host.html`);
      const frame = page.frameLocator('iframe');
      await frame.locator('canvas').waitFor({ timeout: 30_000 });
      const child = page.frames().find((f) => f !== page.mainFrame())!;
      await child.waitForFunction(() => Array.isArray((globalThis as unknown as { __keys?: unknown }).__keys), undefined, { timeout: 30_000 });
      await frame.locator('canvas').click();
      await page.keyboard.press('KeyA');
      await page.keyboard.press('ArrowLeft');
      const keys = await child.evaluate(() => (globalThis as unknown as { __keys: string[] }).__keys);
      await context.close();
      expect(keys).toEqual(['keyDown:65', 'keyUp:65', 'keyDown:37', 'keyUp:37']);
    },
    TIMEOUT_MS,
  );
});
