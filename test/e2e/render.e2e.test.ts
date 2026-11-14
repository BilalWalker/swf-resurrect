// Draws synthetic Shape_JSON through the real PixiBackend in headless Chromium and reads the pixels back
// (breadth task 11.1: stroke caps and joins). Skipped with a reason when Chromium is missing.
// Task 11.2 adds the linear gradient, 11.3 the radial one, 11.4 the bitmap fill. Later drawing tasks add their cases here.
// Validates: Requirements 13.8, 13.9, 13.12, 8.1, 9.1, 9.4
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

  /** Renders the shape (optionally in a container with setColorOffset(ct)) on a white W x H stage; returns an rgb reader. */
  async function renderRgb(shape: ShapeJson, ct?: number[]): Promise<(x: number, y: number) => [number, number, number]> {
    const data = await page!.evaluate(
      async ({ shape: s, w, h, ct: offset }) => {
        const T = (globalThis as unknown as { T: { Application: new () => any; PixiBackend: new () => any } }).T;
        const app = new T.Application();
        await app.init({ width: w, height: h, background: '#ffffff', antialias: true, resolution: 1, autoStart: false });
        // The image 	est:2x2 is made here: black, white / white, black (one texel each).
        const cv = document.createElement('canvas');
        cv.width = 2;
        cv.height = 2;
        const c2 = cv.getContext('2d')!;
        c2.fillStyle = '#000000';
        c2.fillRect(0, 0, 1, 1);
        c2.fillRect(1, 1, 1, 1);
        c2.fillStyle = '#ffffff';
        c2.fillRect(1, 0, 1, 1);
        c2.fillRect(0, 1, 1, 1);
        const url = cv.toDataURL('image/png');
        for (const p of s.paths) if (p.fill?.kind === 'bitmap' && p.fill.image === 'test:2x2') p.fill.image = url;
        const backend = new T.PixiBackend();
        await backend.loadShape(1, s, '');
        const shapeNode = backend.createShape(1);
        if (offset === undefined) {
          app.stage.addChild(shapeNode);
        } else {
          // One sprite: a container holding the shape, with the colour transform on the container.
          const box = backend.createContainer();
          backend.addChildAt(box, shapeNode, 0);
          backend.setColorOffset(box, offset);
          app.stage.addChild(box);
        }
        app.renderer.render(app.stage);
        // Copy the WebGL canvas in the same task as the render, before the drawing buffer is cleared.
        const copy = document.createElement('canvas');
        copy.width = w;
        copy.height = h;
        const ctx = copy.getContext('2d')!;
        ctx.drawImage(app.canvas as HTMLCanvasElement, 0, 0);
        const px = ctx.getImageData(0, 0, w, h).data;
        const r: number[] = [];
        for (let i = 0; i < px.length; i += 4) r.push(px[i]!, px[i + 1]!, px[i + 2]!);
        app.destroy(true, { children: true });
        return { r, width: copy.width };
      },
      { shape, w: W, h: H, ct },
    );
    expect(data.width).toBe(W);
    return (x, y) => {
      const i = (y * W + x) * 3;
      return [data.r[i]!, data.r[i + 1]!, data.r[i + 2]!];
    };
  }

  /** Renders the shape on a white W x H stage and returns a ed(x, y) reader. */
  async function renderRed(shape: ShapeJson): Promise<(x: number, y: number) => number> {
    const rgb = await renderRgb(shape);
    return (x, y) => rgb(x, y)[0];
  }

  async function render(shape: ShapeJson): Promise<(x: number, y: number) => boolean> {
    const red = await renderRed(shape);
    return (x, y) => red(x, y) < 128;
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

  // A linear gradient from black (x 50) to white (x 150) over a rectangle: the FFDec square (x -819.2..819.2) is
  // mapped by the matrix [50/819.2 0 0 1 100 0]. The red channel must follow the ramp, not the last stop colour.
  const ramp = (spread: 'pad' | 'reflect' | 'repeat', rect: [number, number]): ShapeJson => ({
    formatVersion: 1,
    paths: [
      {
        contours: [{ outer: [['M', rect[0], 20], ['L', rect[1], 20], ['L', rect[1], 80], ['L', rect[0], 80], ['Z']], holes: [] }],
        fill: {
          kind: 'gradient',
          type: 'linear',
          matrix: [50 / 819.2, 0, 0, 1, 100, 0],
          stops: [
            { offset: 0, color: '#000000', alpha: 1 },
            { offset: 1, color: '#ffffff', alpha: 1 },
          ],
          spread,
        },
        stroke: null,
      },
    ],
  });

  it('a linear gradient follows its matrix: black at the start, mid grey in the middle, white at the end', async () => {
    const red = await renderRed(ramp('pad', [10, 190]));
    expect(red(5, 50)).toBe(255); // outside the shape: background
    expect(red(20, 50)).toBe(0); // before the start of the gradient: clamped to the first stop
    expect(red(52, 50)).toBeLessThan(20);
    expect(Math.abs(red(100, 50) - 128)).toBeLessThanOrEqual(6);
    expect(red(148, 50)).toBeGreaterThan(235);
    expect(red(180, 50)).toBe(255); // after the end: clamped to the last stop
    expect(red(75, 50)).toBeLessThan(red(125, 50));
  });

  // A radial gradient of radius 50 around (100, 50): transparent black at the centre, opaque black at the rim.
  // Pixi alone would pre-fill its texture with the last stop (opaque black), so the centre would be black (Requirement 8.2).
  const radialShape = (focal?: { x: number; y: number }): ShapeJson => ({
    formatVersion: 1,
    paths: [
      {
        contours: [{ outer: [['M', 10, 0], ['L', 190, 0], ['L', 190, 100], ['L', 10, 100], ['Z']], holes: [] }],
        fill: {
          kind: 'gradient',
          type: 'radial',
          matrix: [50 / 819.2, 0, 0, 50 / 819.2, 100, 50],
          stops: [
            { offset: 0, color: '#000000', alpha: 0 },
            { offset: 1, color: '#000000', alpha: 1 },
          ],
          spread: 'pad',
          ...(focal === undefined ? {} : { focal }),
        },
        stroke: null,
      },
    ],
  });

  it('a radial gradient with a transparent first stop draws a transparent centre, growing opaque to the rim', async () => {
    const red = await renderRed(radialShape());
    expect(red(100, 50)).toBeGreaterThan(245); // centre: stop alpha 0 shows the white background
    expect(red(100 + 25, 50)).toBeGreaterThan(100); // half way: about half covered
    expect(red(100 + 25, 50)).toBeLessThan(160);
    expect(red(100 + 45, 50)).toBeLessThan(40); // near the rim
    expect(red(100, 50 + 45)).toBeLessThan(40);
    expect(red(100 + 80, 50)).toBeLessThan(4); // beyond the rim: clamped to the last stop (opaque black)
  });

  it('a focal point moves the transparent spot toward it', async () => {
    // focal x 409.6 is half the radius (819.2): the spot sits at x 125.
    const red = await renderRed(radialShape({ x: 409.6, y: 0 }));
    expect(red(125, 50)).toBeGreaterThan(245);
    expect(red(75, 50)).toBeLessThan(red(125, 50));
  });

  it('a reflected linear gradient mirrors past the end', async () => {
    const red = await renderRed(ramp('reflect', [10, 190]));
    expect(red(148, 50)).toBeGreaterThan(235);
    expect(red(175, 50)).toBeLessThan(red(155, 50));
  });

  // A 2x2 bitmap at scale 10 over a 40x40 square, repeating: texel (0,0) black, (1,0) white, (0,1) white, (1,1) black.
  const bitmapShape = (smooth: boolean): ShapeJson => ({
    formatVersion: 1,
    paths: [
      {
        contours: [{ outer: [['M', 0, 0], ['L', 40, 0], ['L', 40, 40], ['L', 0, 40], ['Z']], holes: [] }],
        fill: { kind: 'bitmap', image: 'test:2x2', matrix: [10, 0, 0, 10, 0, 0], smooth },
        stroke: null,
      },
    ],
  });

  it('a non-smoothed bitmap fill draws hard texel edges and repeats', async () => {
    const red = await renderRed(bitmapShape(false));
    expect([red(5, 5), red(15, 5), red(5, 15), red(15, 15)]).toEqual([0, 255, 255, 0]);
    expect([red(9, 5), red(10, 5)]).toEqual([0, 255]); // a hard edge between two texels
    expect([red(25, 5), red(35, 5), red(25, 25)]).toEqual([0, 255, 0]); // repeats every 20 px
    expect(red(45, 5)).toBe(255); // outside the shape: background
  });

  it('a smoothed bitmap fill interpolates between texels', async () => {
    const red = await renderRed(bitmapShape(true));
    expect(red(5, 5)).toBeLessThan(40);
    expect(red(10, 5)).toBeGreaterThan(60);
    expect(red(10, 5)).toBeLessThan(200);
  });

  // Colour offsets (task 11.7): a two black squares in a one-sprite scene with redAddTerm 255 and alphaAddTerm 100.
  const blackSquare: ShapeJson = {
    formatVersion: 1,
    paths: [
      {
        contours: [{ outer: [['M', 50, 30], ['L', 90, 30], ['L', 90, 70], ['L', 50, 70], ['Z']], holes: [] }],
        fill: { kind: 'solid', color: '#000000', alpha: 1 },
        stroke: null,
      },
      {
        contours: [{ outer: [['M', 130, 30], ['L', 150, 30], ['L', 150, 70], ['L', 130, 70], ['Z']], holes: [] }],
        fill: { kind: 'solid', color: '#000000', alpha: 1 },
        stroke: null,
      },
    ],
  };

  it('setColorOffset adds the red offset to the fill and leaves the transparent box around it unchanged', async () => {
    // The Player strips the alpha add term, so the transform given here has alpha add 0.
    const rgb = await renderRgb(blackSquare, [1, 1, 1, 1, 255, 0, 0, 0]);
    expect(rgb(70, 50)).toEqual([255, 0, 0]); // fill: black plus 255 red
    expect(rgb(5, 5)).toEqual([255, 255, 255]); // background untouched
    expect(rgb(140, 50)).toEqual([255, 0, 0]);
    expect(rgb(110, 50)).toEqual([255, 255, 255]); // inside the container box, between the two glyphs: unchanged
    expect(rgb(45, 50)).toEqual([255, 255, 255]);
  });
});