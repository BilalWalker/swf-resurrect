// Regression for task 17: FFDec wraps shape paths in <g transform="matrix(1,0,0,1,tx,ty)"> and
// the paths are already in shape-origin coordinates. Pixi 8.22 Graphics.svg() ignores that group
// transform, so the Graphics.svg bounds are already origin-relative: for clickgoto shape 1 they start near
// -42.7, not near 0.5 (which is where they would start if the group translate were applied). Shifting by -origin again
// (the old createShape/loadShape) drew every shape one origin up-left.
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { Graphics } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractSvgOrigin } from '../../src/convert/svgOrigin';
import { flattenSvgWrapper } from '../../template/runtime/svgFlatten';
import { PixiBackend } from '../../template/runtime/pixi/pixiBackend';

const svg = readFileSync(new URL('../fixtures/clickgoto/shapes/1.svg', import.meta.url), 'utf8');
const flat = flattenSvgWrapper(svg);

beforeAll(() => {
  // Pixi's SVG parser reads `document.createElement('div').innerHTML`, `children`, `querySelector(All)`.
  // Node has none of that, so back it with a real XML parser (@xmldom/xmldom). Only the SVG-reading
  // surface Pixi uses is provided; the geometry comes from Pixi's own parser and bounds code.
  const proto = Object.getPrototypeOf(new DOMParser().parseFromString('<a/>', 'text/xml').documentElement) as object;
  Object.defineProperty(proto, 'children', {
    configurable: true,
    get(this: { childNodes: ArrayLike<{ nodeType: number }> }) {
      return Array.from({ length: this.childNodes.length }, (_, i) => this.childNodes[i]).filter((n) => n.nodeType === 1);
    },
  });
  Object.defineProperty(proto, 'querySelectorAll', {
    configurable: true,
    value(this: { getElementsByTagName(n: string): unknown }, sel: string) {
      return this.getElementsByTagName(sel);
    },
  });
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      const div = {
        set innerHTML(text: string) {
          (div as { root?: unknown }).root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
        },
        querySelector: () => (div as { root?: unknown }).root,
      };
      return div;
    },
  };
});
describe('FFDec shape SVG origin in the Pixi backend (clickgoto shape 1)', () => {
  it('Graphics.svg local bounds are origin-relative: x starts near -42 (group translate ignored)', () => {
    const b = new Graphics().svg(svg).getLocalBounds().rectangle;
    expect(b.x).toBeCloseTo(-42.5, 0);
    expect(b.y).toBeCloseTo(-40.5, 0);
    expect(b.width).toBeCloseTo(85, 0);
  });

  it('flattening removes only the wrapper transform, is idempotent, and keeps the origin extractable from the raw form', () => {
    expect(flat).not.toContain('transform');
    expect(flat).toContain('<g>');
    expect(flattenSvgWrapper(flat)).toBe(flat);
    expect(flat.replace('<g>', '<g transform="matrix(1.0, 0.0, 0.0, 1.0, 42.5, 40.5)">')).toBe(svg);
    expect(new Graphics().svg(flat).getLocalBounds().rectangle.x).toBeCloseTo(-42.5, 0);
  });

  it.each([['wrapped', svg], ['flattened', flat]])('loadShape bounds equal the shape-origin-space bounds, %s input (x near -42.5, not -85)', async (_n, text) => {
    const origin = extractSvgOrigin(svg);
    expect(origin).toEqual({ x: 42.5, y: 40.5 });
    const bounds = await new PixiBackend().loadShape(1, text, origin!);
    expect(bounds.x).toBeCloseTo(-42.5, 0);
    expect(bounds.y).toBeCloseTo(-40.5, 0);
  });

  it.each([['wrapped', svg], ['flattened', flat]])('createShape draws the shape with its origin on the node origin, %s input', async (_n, text) => {
    const backend = new PixiBackend();
    await backend.loadShape(1, text, extractSvgOrigin(svg)!);
    const node = backend.createShape(1) as import('pixi.js').Container;
    const b = node.getLocalBounds().rectangle;
    expect(b.x).toBeCloseTo(-42.5, 0);
    expect(b.y).toBeCloseTo(-40.5, 0);
  });
});
