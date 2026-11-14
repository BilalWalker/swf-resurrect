// Draws synthetic Shape_JSON through the real PixiBackend in headless Chromium and reads the pixels back
// (breadth task 11.1: stroke caps and joins). Skipped with a reason when Chromium is missing.
// Later drawing tasks (gradients, bitmap fills, colour offsets) add their cases here.
// Validates: Requirements 13.8, 13.9, 13.12
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ShapeJson } from '../../template/runtime/shapeJson';

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

const W = 200;
const H = 100;

type Cap = 'butt' | 'round' | 'square';
type Join = 'miter' | 'round' | 'bevel';

function strokeShape(points: Array<[number, number]>, cap: Cap, join: Join, width: number): ShapeJson {
  const [first, ...rest] = points;
  return {
    formatVersion: 1,
    paths: [
      {
        contours: [{ outer: [['M', first![0], first![1]], ...rest.map(([x, y]) => ['L', x, y] as ['L', number, number])], holes: [] }],
        fill: null,
        stroke: { color: '#000000', alpha: 1, width, cap, join, miterLimit: 4 },
      },
    ],
  };
}

describe.skipIf(reason !== null)(`PixiBackend strokes read back from Chromium${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  let tempRoot = '';
  let bundle = '';
  let browser: Browser | null = null;
  let page: Page | null = null;

  // A real Vite build of the real backend into one script, and a real Chromium launch: allow 30 s.
  beforeAll(async () => {
    await mkdir(resolve(repoRoot, '.work'), { recursive: true });
    tempRoot = await mkdtemp(resolve(repoRoot, '.work', 'render-e2e-'));
    const entry = resolve(tempRoot, 'entry.ts');
    const backendPath = resolve(repoRoot, 'template/runtime/pixi/pixiBackend.ts').replace(/\\/g, '/');
    await writeFile(entry, `import { Application } from 'pixi.js';\nimport { PixiBackend } from '${backendPath}';\nexport { Application, PixiBackend };\n`);
    const outDir = resolve(tempRoot, 'dist');
    await build({
      root: tempRoot,
      configFile: false,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, lib: { entry, name: 'T', formats: ['iife'], fileName: () => 't.js' } },
    });
    bundle = await readFile(resolve(outDir, 't.js'), 'utf8');
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');
    await page.addScriptTag({ content: bundle });
  }, 30_000);

  afterAll(async () => {
    await browser?.close().catch(() => undefined);
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 30_000);

  /** Renders the shape on a white W x H stage and returns a `dark(x, y)` reader (red channel below 128). */
  async function render(shape: ShapeJson): Promise<(x: number, y: number) => boolean> {
    const data = await page!.evaluate(
      async ({ shape: s, w, h }) => {
        const T = (globalThis as unknown as { T: { Application: new () => any; PixiBackend: new () => any } }).T;
        const app = new T.Application();
        await app.init({ width: w, height: h, background: '#ffffff', antialias: true, resolution: 1, autoStart: false });
        const backend = new T.PixiBackend();
        await backend.loadShape(1, s, '');
        app.stage.addChild(backend.createShape(1));
        app.renderer.render(app.stage);
        // Copy the WebGL canvas in the same task as the render, before the drawing buffer is cleared.
        const copy = document.createElement('canvas');
        copy.width = w;
        copy.height = h;
        const ctx = copy.getContext('2d')!;
        ctx.drawImage(app.canvas as HTMLCanvasElement, 0, 0);
        const px = ctx.getImageData(0, 0, w, h).data;
        const r: number[] = [];
        for (let i = 0; i < px.length; i += 4) r.push(px[i]!);
        app.destroy(true, { children: true });
        return { r, width: copy.width };
      },
      { shape, w: W, h: H },
    );
    expect(data.width).toBe(W);
    return (x, y) => data.r[y * W + x]! < 128;
  }

  /** Bounding box of the dark pixels. */
  function extents(dark: (x: number, y: number) => boolean): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = W;
    let maxX = -1;
    let minY = H;
    let maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!dark(x, y)) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return { minX, maxX, minY, maxY };
  }

  const line: Array<[number, number]> = [
    [50, 50],
    [150, 50],
  ];

  it('butt cap ends at the end point', async () => {
    const e = extents(await render(strokeShape(line, 'butt', 'miter', 20)));
    expect(e).toEqual({ minX: 50, maxX: 149, minY: 40, maxY: 59 });
  });

  it('square cap extends past the end point by half the width', async () => {
    const e = extents(await render(strokeShape(line, 'square', 'miter', 20)));
    expect(e).toEqual({ minX: 40, maxX: 159, minY: 40, maxY: 59 });
  });

  it('round cap extends past the end point but stays inside the square cap box, leaving its corner empty', async () => {
    const dark = await render(strokeShape(line, 'round', 'miter', 20));
    const e = extents(dark);
    expect(e.minX).toBeGreaterThanOrEqual(40);
    expect(e.minX).toBeLessThan(50);
    expect(e.maxX).toBeLessThanOrEqual(159);
    expect(e.maxX).toBeGreaterThan(149);
    expect(dark(41, 41)).toBe(false); // the corner of the square cap box
    expect(dark(45, 50)).toBe(true);
  });

  const corner: Array<[number, number]> = [
    [40, 70],
    [100, 70],
    [100, 20],
  ];

  it('miter join fills the outer corner; bevel and round do not', async () => {
    const miter = await render(strokeShape(corner, 'butt', 'miter', 20));
    const bevel = await render(strokeShape(corner, 'butt', 'bevel', 20));
    const round = await render(strokeShape(corner, 'butt', 'round', 20));
    expect(miter(108, 78)).toBe(true);
    expect(bevel(108, 78)).toBe(false);
    expect(round(108, 78)).toBe(false);
  });

  it('round join fills inside the circle around the corner; bevel does not', async () => {
    const bevel = await render(strokeShape(corner, 'butt', 'bevel', 20));
    const round = await render(strokeShape(corner, 'butt', 'round', 20));
    expect(round(107, 75)).toBe(true);
    expect(bevel(107, 75)).toBe(false);
  });
});
