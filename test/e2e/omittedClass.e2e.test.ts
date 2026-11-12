// An Emitted_Project with a class that cannot load, and one with a class that only has a type error,
// both build and render their timeline frame (breadth task 4.6, design 19.1, 19.7).
// Skipped with a reason when Chromium is missing.
// Validates: Requirements 23.4, 23.9
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { emit } from '../../src/emit/emit';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import { buildProject } from '../../src/verify/edge/buildProject';
import { renderFrames } from '../../src/verify/edge/renderFrames';
import type { SceneJson } from '../../template/runtime/scene';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

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
const scene = (className: string): SceneJson => ({
  formatVersion: 1,
  stage: { width: 60, height: 40, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: {
    '0': sprite([2]),
    '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } },
    '2': sprite([1], className),
  },
});
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="#ff0000"/></svg>\n';

const tc = (className: string, text: string): TranslatedClass => ({
  className,
  fileName: `${className}.ts`,
  text,
  diagnostics: [],
  spans: [],
  extendsName: null,
  extendsQualified: null,
  importRecords: [],
});

describe.skipIf(reason !== null)(`emitted project with a non-loading or loose class${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  let tempRoot = '';
  afterAll(async () => {
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  async function project(name: string, cls: TranslatedClass) {
    await mkdir(resolve(repoRoot, '.work'), { recursive: true });
    tempRoot = tempRoot === '' ? await mkdtemp(resolve(repoRoot, '.work', 'omitted-class-')) : tempRoot;
    const staging = join(tempRoot, name, 'staging');
    await mkdir(join(staging, 'assets'), { recursive: true });
    const svg = join(staging, 'assets', '1.svg');
    await writeFile(svg, SVG);
    const sc = scene(cls.className);
    const scenePath = join(staging, 'assets', 'scene.json');
    await writeFile(scenePath, JSON.stringify(sc));
    const result = await emit(
      {
        stagingDir: staging,
        scenePath,
        svgPaths: [svg],
        scene: sc,
        unsupported: [],
        stats: { svgWritten: 1, morphSkipped: 0, declaredShapes: 1 },
      },
      {
        outputDir: join(tempRoot, name, 'project'),
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
    const built = await buildProject(result.outputDir); // the project's own vite build, as `npm run build` runs it
    try {
      const frames = await renderFrames(built.distDir, [1], { width: 60, height: 40 });
      return { result, frame: frames.get(1), registry: await readFile(join(result.outputDir, 'src', 'classes.ts'), 'utf8') };
    } finally {
      await built.dispose();
    }
  }

  function redPixels(frame: unknown): number {
    const img = frame as { data: Uint8Array; width: number; height: number };
    expect('renderFailed' in img ? (img as { renderFailed: string }).renderFailed : '').toBe('');
    let n = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 200 && img.data[i + 1] < 60 && img.data[i + 2] < 60) n++;
    return n;
  }

  it(
    'a class with an unresolved relative import is omitted; the project builds and renders its timeline frame',
    async () => {
      const { result, frame, registry } = await project(
        'unloadable',
        tc('Broken', "import { gone } from './DoesNotExist';\nexport class Broken { x = gone; }\n"),
      );
      expect(result.omissions.map((o) => [o.className, o.reason.kind])).toEqual([['Broken', 'unresolved-import']]);
      expect(registry).not.toContain('"Broken"');
      expect(redPixels(frame)).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );

  it(
    'a class with only a type error stays registered and loose; the project builds and renders',
    async () => {
      const { result, frame, registry } = await project('loose', tc('Loose', 'export class Loose { x: number = "s"; }\n'));
      expect(result.omissions).toEqual([]);
      expect(result.loose.map((l) => l.className)).toEqual(['Loose']);
      expect(registry).toContain('"Loose"');
      expect(redPixels(frame)).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );
});
