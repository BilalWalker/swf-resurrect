import { Container, FillGradient, FillPattern, Graphics, ImageSource, Matrix, Texture, type FillInput } from 'pixi.js';
import type { NodeHandle, RenderBackend, ShapeBounds } from '../backend';
import { GRADIENT_HALF_EXTENT, GRADIENT_TEXTURE_SIZE } from '../gradientMatrix';
import { assertShapeDrawn, DRAWN_FILLS, ShapeJsonError, type DrawnFills, type PathCmd, type ShapeFill, type ShapeJson, type ShapePath } from '../shapeJson';

/** Per-node values that combine into the Pixi alpha. */
interface NodeState {
  alpha: number;
  colorAlpha: number;
}

export interface PixiBackendOptions {
  /** Where the error element is appended. Defaults to document.body. */
  errorHost?: HTMLElement;
  /** The fill kinds this backend may draw; defaults to DRAWN_FILLS. A fill outside it is refused and named. */
  caps?: DrawnFills;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function tracePath(g: Graphics, cmds: readonly PathCmd[]): void {
  for (const c of cmds) {
    switch (c[0]) {
      case 'M':
        g.moveTo(c[1], c[2]);
        break;
      case 'L':
        g.lineTo(c[1], c[2]);
        break;
      case 'Q':
        g.quadraticCurveTo(c[1], c[2], c[3], c[4]);
        break;
      case 'C':
        g.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
        break;
      case 'Z':
        g.closePath();
        break;
    }
  }
}

const WRAP_MODE = { pad: 'clamp-to-edge', reflect: 'mirror-repeat', repeat: 'repeat' } as const;

/** '#rrggbb' and an alpha in 0..1 as '#rrggbbaa', which Pixi's Color reads. */
function stopColor(color: string, alpha: number): string {
  return color + Math.round(clamp01(alpha) * 255).toString(16).padStart(2, '0');
}

/**
 * The Pixi fill for a linear gradient (design section 3, "Gradient matrix"). Pixi 8.22.0 sources relied on, under
 * node_modules/pixi.js/lib/scene/graphics/shared:
 * - fill/FillGradient.mjs:33 and :97: `wrapMode` is the texture address mode (pad: clamp-to-edge, reflect:
 *   mirror-repeat, repeat: repeat); :45 `textureSpace`: with 'global' the start/end points are in shape space, not in
 *   0..1 of the shape bounds (:106 scales by the texture size only for 'local').
 * - fill/FillGradient.mjs:66-109 `buildLinearGradient`: the texture is textureSize x 1 (:90, createLinearGradient
 *   along x) and `transform` (:103-109) maps texture pixels to start/end. With start (-819.2, 0) and end (819.2, 0)
 *   that transform is the texture-to-FFDec-square map of gradientMatrix.ts.
 * - fill/FillGradient.mjs:116-119 `buildGradient` builds the texture and the transform; `texture` and `transform`
 *   are public (pixi.js.d.ts:25662, :25664).
 * - utils/convertFillInputToFillStyle.mjs:38-44 `handleFillGradient` copies `value.transform` into the fill style when
 *   `g.fill(grad)` runs, so the replacement below must happen before that call.
 * - maths/matrix/Matrix.mjs:355 `append(m)` computes `this x m`: the FFDec matrix is the receiver.
 */
function linearGradient(fill: Extract<ShapeFill, { kind: 'gradient' }>): FillGradient {
  const grad = new FillGradient({
    type: 'linear',
    start: { x: -GRADIENT_HALF_EXTENT, y: 0 },
    end: { x: GRADIENT_HALF_EXTENT, y: 0 },
    textureSpace: 'global',
    colorStops: fill.stops.map((s) => ({ offset: s.offset, color: stopColor(s.color, s.alpha) })),
    wrapMode: WRAP_MODE[fill.spread],
  });
  grad.buildGradient();
  grad.transform = new Matrix(...fill.matrix).append(grad.transform);
  return grad;
}

/**
 * The Pixi fill for a radial gradient. Same transform path as `linearGradient`; the texture is replaced. Pixi 8.22.0
 * sources relied on, under node_modules/pixi.js/lib/scene/graphics/shared:
 * - fill/FillGradient.mjs:129-174 `buildRadialGradient`: with centre and outerCentre (0, 0), innerRadius 0 and
 *   outerRadius 819.2 the transform is scale(1/scale) then translate(-819.2, -819.2) (:166-173, 'global'), where
 *   scale = textureSize / (2 * 819.2) (:140): the texture-to-FFDec-square map of gradientMatrix.ts ('radial').
 * - fill/FillGradient.mjs:152-153: Pixi first fills the whole texture with the LAST stop colour, opaque to the
 *   gradient's own alpha, and :154-159 draws the gradient over it. A first stop with alpha 0 then shows the last
 *   stop colour in the centre, not transparency (Requirement 8.2). So the texture is replaced by an own canvas drawn
 *   without that pre-fill; `texture` is public and `buildGradient` returns early once it is set (:130).
 * - fill/FillGradient.mjs:160-165: the texture is an `ImageSource` with `addressMode: wrapMode` (clamp-to-edge for pad).
 * - The canvas gradient is `createRadialGradient(128 + fx*k, 128 + fy*k, 0, 128, 128, 128)`, k = 128 / 819.2: the focal
 *   point of the SWF gradient in texture pixels, the circle of radius 819.2 in texture pixels 128.
 */
function radialGradient(fill: Extract<ShapeFill, { kind: 'gradient' }>): FillGradient {
  const grad = new FillGradient({
    type: 'radial',
    center: { x: 0, y: 0 },
    outerCenter: { x: 0, y: 0 },
    innerRadius: 0,
    outerRadius: GRADIENT_HALF_EXTENT,
    textureSpace: 'global',
    colorStops: fill.stops.map((s) => ({ offset: s.offset, color: stopColor(s.color, s.alpha) })),
    wrapMode: WRAP_MODE[fill.spread],
  });
  grad.buildGradient();
  const size = GRADIENT_TEXTURE_SIZE;
  const half = size / 2;
  const k = half / GRADIENT_HALF_EXTENT;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new ShapeJsonError('radial gradient: no 2d canvas context');
  const fx = fill.focal?.x ?? 0;
  const fy = fill.focal?.y ?? 0;
  const g2 = ctx.createRadialGradient(half + fx * k, half + fy * k, 0, half, half, half);
  for (const s of fill.stops) g2.addColorStop(s.offset, stopColor(s.color, s.alpha));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, size, size);
  grad.texture?.destroy(true);
  grad.texture = new Texture({ source: new ImageSource({ resource: canvas, addressMode: WRAP_MODE[fill.spread] }) });
  grad.transform = new Matrix(...fill.matrix).append(grad.transform!);
  return grad;
}

/** The decoded textures of one shape, by image|smooth (see loadBitmapTextures). */
type BitmapTextures = ReadonlyMap<string, Texture>;

const bitmapKey = (image: string, smooth: boolean): string => `${image}|${smooth ? 'smooth' : 'nearest'}`;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ShapeJsonError(`bitmap fill: image failed to load: ${url}`));
    img.src = url;
  });
}

/**
 * Loads the image of every bitmap fill of a shape from `assetBase + fill.image` through an HTMLImageElement. A failed
 * load rejects with a ShapeJsonError naming the image; the loader shows it and does not start playback. Pixi 8.22.0
 * sources relied on, under node_modules/pixi.js/lib/scene/graphics/shared:
 * - fill/FillPattern.mjs:26-49: `new FillPattern(texture, 'repeat')` sets both address modes of the texture source
 *   to `repeat` (:8-12, :44-48); `setTransform` (:55-64) copies the matrix into `transform`.
 * - utils/convertFillInputToFillStyle.mjs:30-37 `handleFillPattern`: the style takes `value.texture` and
 *   `value.transform` as `matrix` when `g.fill(pattern)` runs, so the transform is set before that call.
 * - utils/generateTextureFillMatrix.mjs:10 and :43-44: the style matrix is inverted and the texture is scaled by
 *   1 / source size, so the pattern transform maps texture PIXELS to shape space, the same convention as a SWF fill
 *   matrix, with no further scaling here.
 * - `scaleMode` of the ImageSource is 'nearest' when the SWF fill is not smoothed, 'linear' otherwise.
 */
async function loadBitmapTextures(shape: ShapeJson, assetBase: string): Promise<BitmapTextures> {
  const out = new Map<string, Texture>();
  for (const path of shape.paths) {
    const fill = path.fill;
    if (fill === null || fill.kind !== 'bitmap') continue;
    const key = bitmapKey(fill.image, fill.smooth);
    if (out.has(key)) continue;
    const img = await loadImage(assetBase + fill.image);
    out.set(key, new Texture({ source: new ImageSource({ resource: img, scaleMode: fill.smooth ? 'linear' : 'nearest' }) }));
  }
  return out;
}

function bitmapPattern(fill: Extract<ShapeFill, { kind: 'bitmap' }>, textures: BitmapTextures): FillPattern {
  const texture = textures.get(bitmapKey(fill.image, fill.smooth));
  if (texture === undefined) throw new ShapeJsonError(`bitmap fill: image not loaded: ${fill.image}`);
  const pattern = new FillPattern(texture, 'repeat');
  pattern.setTransform(new Matrix(...fill.matrix));
  return pattern;
}

/** drawFill: the fill check first (no warn-and-skip), then the fill of one contour; holes are cut out of it. */
function drawFill(g: Graphics, path: ShapePath, textures: BitmapTextures): void {
  const fill = path.fill;
  if (fill === null) return;
  let style: FillInput;
  if (fill.kind === 'solid') style = { color: fill.color, alpha: fill.alpha };
  else if (fill.kind === 'gradient') style = fill.type === 'linear' ? linearGradient(fill) : radialGradient(fill);
  else style = bitmapPattern(fill, textures);
  for (const contour of path.contours) {
    tracePath(g, contour.outer);
    g.fill(style);
    for (const hole of contour.holes) {
      tracePath(g, hole);
      g.cut();
    }
  }
}

function drawStroke(g: Graphics, path: ShapePath): void {
  const s = path.stroke;
  if (s === null) return;
  for (const contour of path.contours) {
    tracePath(g, contour.outer);
    for (const hole of contour.holes) tracePath(g, hole);
    g.stroke({ width: s.width, color: s.color, alpha: s.alpha, cap: s.cap, join: s.join, miterLimit: s.miterLimit });
  }
}

/** Draws every path in order: its fill (outer contours with holes cut), then its stroke. */
function drawShape(shape: ShapeJson, textures: BitmapTextures): Graphics {
  const g = new Graphics();
  shape.paths.forEach((path) => {
    drawFill(g, path, textures);
    drawStroke(g, path);
  });
  return g;
}
/**
 * PixiJS 8.22 implementation of RenderBackend. The only file importing pixi.js.
 * Stage creation and pointer wiring belong to the boot code; this class owns
 * the display nodes only.
 */
export class PixiBackend implements RenderBackend {
  private readonly templates = new Map<number, { graphics: Graphics }>();
  private readonly state = new WeakMap<Container, NodeState>();
  private readonly errorHost: HTMLElement | undefined;
  private readonly caps: DrawnFills;
  private errorElement: HTMLElement | null = null;
  private warnedOffsets = false;

  constructor(options: PixiBackendOptions = {}) {
    this.errorHost = options.errorHost;
    this.caps = options.caps ?? DRAWN_FILLS;
  }

  async loadShape(symbolId: number, shape: ShapeJson, assetBase: string): Promise<ShapeBounds> {
    // Throws ShapeJsonError on a fill that is not drawn or an image that does not load; the loader shows it and does not start playback.
    assertShapeDrawn(shape, this.caps);
    const graphics = drawShape(shape, await loadBitmapTextures(shape, assetBase));
    const b = graphics.getLocalBounds().rectangle;
    this.templates.set(symbolId, { graphics });
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }
  createContainer(): NodeHandle {
    return this.track(new Container());
  }

  createShape(symbolId: number): NodeHandle {
    const container = this.track(new Container());
    const template = this.templates.get(symbolId);
    if (template === undefined) return container;
    // Shallow clone shares the GraphicsContext. Paths are already in shape-origin space,
    // so the shape's own origin is the container origin: no offset.
    container.addChild(template.graphics.clone());
    return container;
  }

  addChildAt(parent: NodeHandle, child: NodeHandle, index: number): void {
    (parent as Container).addChildAt(child as Container, index);
  }

  removeChild(parent: NodeHandle, child: NodeHandle): void {
    (parent as Container).removeChild(child as Container);
  }

  setTransform(
    node: NodeHandle,
    t: { x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number },
  ): void {
    const c = node as Container;
    c.position.set(t.x, t.y);
    c.scale.set(t.scaleX, t.scaleY);
    c.angle = t.rotationDeg;
  }

  setAlpha(node: NodeHandle, alpha: number): void {
    const c = node as Container;
    this.stateOf(c).alpha = alpha;
    this.applyAlpha(c);
  }

  setVisible(node: NodeHandle, visible: boolean): void {
    (node as Container).visible = visible;
  }

  setColorMultiplier(node: NodeHandle, r: number, g: number, b: number, a: number): void {
    const c = node as Container;
    const to8 = (v: number): number => Math.round(clamp01(v) * 255);
    c.tint = (to8(r) << 16) | (to8(g) << 8) | to8(b);
    this.stateOf(c).colorAlpha = clamp01(a);
    this.applyAlpha(c);
  }

  /** Colour transform offsets are not supported; report once. */
  warnColorOffsetsUnsupported(): void {
    if (this.warnedOffsets) return;
    this.warnedOffsets = true;
    console.warn('PixiBackend: colour transform offsets are not supported and are ignored');
  }

  destroyNode(node: NodeHandle): void {
    // Releases the subtree. The shared GraphicsContext belongs to the template.
    (node as Container).destroy({ children: true, context: false });
  }

  showError(message: string): void {
    const host = this.errorHost ?? document.body;
    if (this.errorElement === null) {
      const el = document.createElement('div');
      el.setAttribute('role', 'alert');
      el.id = 'swf-resurrect-error';
      el.style.cssText = 'color:#b00020;font:14px sans-serif;padding:8px;';
      host.appendChild(el);
      this.errorElement = el;
    }
    this.errorElement.textContent = message;
  }

  private track(c: Container): Container {
    this.state.set(c, { alpha: 1, colorAlpha: 1 });
    return c;
  }

  private stateOf(c: Container): NodeState {
    let s = this.state.get(c);
    if (s === undefined) {
      s = { alpha: 1, colorAlpha: 1 };
      this.state.set(c, s);
    }
    return s;
  }

  private applyAlpha(c: Container): void {
    const s = this.stateOf(c);
    c.alpha = clamp01(s.alpha * s.colorAlpha);
  }
}
