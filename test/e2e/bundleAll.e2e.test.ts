// The whole bundle builds after the Bundler_Guard: one class per kill case and two clean classes go through
// Emit with the real guard, and the project's own `vite build` succeeds with the kill classes omitted
// (breadth task 23.4, design 21.4). The same on the `slider_component` copy when it exists.
// Skipped with a reason when Chromium is missing (the slider case also needs Java and FFDec).
// Validates: Requirements 26.11, 26.12, 23.5
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { checkClassFiles } from '../../src/emit/bundlerGuard';
import { emit } from '../../src/emit/emit';
import { main } from '../../src/pipeline/cli';
import type { TranslatedClass } from '../../src/translate/planTranslate';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import { buildProject } from '../../src/verify/edge/buildProject';
import { renderFrames } from '../../src/verify/edge/renderFrames';
import type { SceneJson } from '../../template/runtime/scene';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const sliderSwf = resolve(repoRoot, '.work/local/slider_component/test.swf');
const ffdecJar = resolve(repoRoot, 'tools/ffdec/ffdec-cli.jar');

function chromiumMissing(): boolean {
  let p = '';
  try {
    p = chromium.executablePath();
  } catch {
    /* fall through */
  }
  return p === '' || !existsSync(p);
}
const reason = chromiumMissing() ? 'Playwright Chromium is not installed' : null;
const java = spawnSync('java', ['-version'], { windowsHide: true });
const sliderReason: string | null =
  reason ??
  (!existsSync(sliderSwf)
    ? '.work/local/slider_component/test.swf is absent'
    : java.error !== undefined || java.status !== 0
      ? 'Java is not available on PATH'
      : !existsSync(ffdecJar)
        ? 'tools/ffdec is absent'
        : null);
const TIMEOUT_MS = 10 * 60 * 1000;

const wrap = (name: string, body: string): string => `export class ${name} {\n  m(): number {\n    ${body}\n  }\n}\n`;

/** The seven kill cases of Appendix A.12, then two clean classes. */
const KILL: [string, string][] = [
  ['KillYield', wrap('KillYield', 'const yield = 1; return yield;')],
  ['KillAwait', wrap('KillAwait', 'const await = 1; return await;')],
  ['KillPackage', wrap('KillPackage', 'const package = 1; return package;')],
  ['KillDuplicate', wrap('KillDuplicate', 'let a = 1; let a = 2; return a;')],
  ['KillDelete', wrap('KillDelete', 'let x = 1; delete x; return x;')],
  ['KillWith', wrap('KillWith', 'with ({}) { return 1; }')],
  ['KillBreak', wrap('KillBreak', 'break; return 1;')],
];
const CLEAN: [string, string][] = [
  ['CleanOne', wrap('CleanOne', 'return 1;')],
  ['CleanTwo', wrap('CleanTwo', 'return 2;')],
];

const m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
const ct: [number, number, number, number, number, number, number, number] = [1, 1, 1, 1, 0, 0, 0, 0];
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" fill="#ff0000"/></svg>\n';

function sceneFor(classNames: string[]): SceneJson {
  const symbols: SceneJson['symbols'] = {
    '0': {
      type: 'sprite',
      frameCount: 1,
      labels: [],
      frames: [classNames.map((_, i) => ({ depth: i + 1, symbolId: 10 + i, matrix: m, colorTransform: ct, name: '' }))],
    },
    '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } },
  };
  classNames.forEach((className, i) => {
    symbols[String(10 + i)] = {
      type: 'sprite',
      className,
      frameCount: 1,
      labels: [],
      frames: [[{ depth: 1, symbolId: 1, matrix: m, colorTransform: ct, name: '' }]],
    };
  });
  return {
    formatVersion: 1,
    stage: { width: 60, height: 40, backgroundColor: '#ffffff', frameRate: 24 },
    rootSymbolId: 0,
    symbols,
  };
}

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

describe.skipIf(reason !== null)(`whole bundle after the guard${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  let tempRoot = '';
  afterAll(async () => {
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  async function root(): Promise<string> {
    await mkdir(resolve(repoRoot, '.work'), { recursive: true });
    tempRoot = tempRoot === '' ? await mkdtemp(resolve(repoRoot, '.work', 'bundle-all-')) : tempRoot;
    return tempRoot;
  }

  it(
    'builds with the seven kill classes omitted as bundler-parse and the clean classes registered',
    async () => {
      const base = join(await root(), 'synthetic');
      const staging = join(base, 'staging');
      await mkdir(join(staging, 'assets'), { recursive: true });
      const svg = join(staging, 'assets', '1.svg');
      await writeFile(svg, SVG);
      const all = [...KILL, ...CLEAN];
      const sc = sceneFor(all.map(([n]) => n));
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
          outputDir: join(base, 'project'),
          force: false,
          swfPath: join(staging, 'x.swf'),
          cwd: repoRoot,
          homeDir: base,
          templateDir: resolve(repoRoot, 'template'),
          translated: all.map(([n, t]) => tc(n, t)),
          handwrittenDir: null,
          gate: (files) => typeCheckProject({ files, repoRoot }),
          bundlerGuard: checkClassFiles,
        },
      );

      expect(result.problems ?? []).toEqual([]);
      expect(result.omissions.map((o) => [o.className, o.reason.kind])).toEqual(
        KILL.map(([n]) => [n, 'bundler-parse']).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      );
      const registry = await readFile(join(result.outputDir, 'src', 'classes.ts'), 'utf8');
      for (const [n] of KILL) {
        expect(registry).not.toContain(`"${n}"`);
        expect(existsSync(join(result.outputDir, 'src', `${n}.ts`))).toBe(true); // the file stays written
      }
      for (const [n] of CLEAN) expect(registry).toContain(`"${n}"`);

      // The project's own vite build, as `npm run build` runs it: it succeeds, and the timeline renders.
      const built = await buildProject(result.outputDir);
      try {
        const frames = await renderFrames(built.distDir, [1], { width: 60, height: 40 });
        const img = frames.get(1) as unknown as { data: Uint8Array; renderFailed?: string };
        expect(img.renderFailed ?? '').toBe('');
        let red = 0;
        for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 200 && img.data[i + 1] < 60 && img.data[i + 2] < 60) red++;
        expect(red).toBeGreaterThan(0);
      } finally {
        await built.dispose();
      }
    },
    TIMEOUT_MS,
  );

  it.skipIf(sliderReason !== null)(
    `slider_component emits and builds the whole bundle${sliderReason === null ? '' : ` (skipped: ${sliderReason})`}`,
    async () => {
      const out = join(await root(), 'slider');
      expect(await main([sliderSwf, out, '--force'])).toBe(0);
      const built = await buildProject(out);
      try {
        const registry = await readFile(join(out, 'src', 'classes.ts'), 'utf8');
        expect(registry).toContain('MainTimeline');
        expect(existsSync(join(built.distDir, 'index.html'))).toBe(true);
      } finally {
        await built.dispose();
      }
    },
    TIMEOUT_MS,
  );
});
