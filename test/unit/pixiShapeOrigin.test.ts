/// <reference lib="dom" />
// Regression for task 17, now on the Shape_JSON path: FFDec wraps shape paths in <g transform="matrix(1,0,0,1,tx,ty)">
// and the paths are already in shape-origin coordinates. The Shape_Function strips the wrapper without applying it, so
// the drawn bounds of clickgoto shape 1 start near -42.5, not near 0.5 and not near -85 (shifting by -origin again drew
// every shape one origin up-left).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractSvgOrigin } from '../../src/convert/svgOrigin';
import { svgToShapeJson } from '../../src/convert/svgToShape';
import { PixiBackend } from '../../template/runtime/pixi/pixiBackend';

const svg = readFileSync(new URL('../fixtures/clickgoto/shapes/1.svg', import.meta.url), 'utf8');
const { shape } = svgToShapeJson(svg, 'shape');

describe('FFDec shape origin in the Pixi backend (clickgoto shape 1)', () => {
  it('the wrapper translation is the origin the Scene_JSON records', () => {
    expect(extractSvgOrigin(svg)).toEqual({ x: 42.5, y: 40.5 });
  });

  it('loadShape bounds equal the shape-origin-space bounds (x near -42.5, not -85)', async () => {
    const bounds = await new PixiBackend().loadShape(1, shape, 'assets/');
    expect(bounds.x).toBeCloseTo(-42.5, 0);
    expect(bounds.y).toBeCloseTo(-40.5, 0);
    expect(bounds.width).toBeCloseTo(85, 0);
  });

  it('createShape draws the shape with its origin on the node origin', async () => {
    const backend = new PixiBackend();
    await backend.loadShape(1, shape, 'assets/');
    const node = backend.createShape(1) as import('pixi.js').Container;
    const b = node.getLocalBounds().rectangle;
    expect(b.x).toBeCloseTo(-42.5, 0);
    expect(b.y).toBeCloseTo(-40.5, 0);
  });
});
