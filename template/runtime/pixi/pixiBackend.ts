import { Container, Graphics } from 'pixi.js';
import type { NodeHandle, RenderBackend, ShapeBounds } from '../backend';
import { assertFillDrawn, ShapeJsonError, type PathCmd, type ShapeJson, type ShapePath } from '../shapeJson';

/** Per-node values that combine into the Pixi alpha. */
interface NodeState {
  alpha: number;
  colorAlpha: number;
}

export interface PixiBackendOptions {
  /** Where the error element is appended. Defaults to document.body. */
  errorHost?: HTMLElement;
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

/** drawFill: the fill check first (no warn-and-skip), then the fill of one contour; holes are cut out of it. */
function drawFill(g: Graphics, path: ShapePath, index: number): void {
  const fill = path.fill;
  if (fill === null) return;
  assertFillDrawn(fill, `paths[${index}].fill`);
  // Gradient and bitmap drawing arrives with the commit that flips their DRAWN_FILLS flag.
  if (fill.kind !== 'solid') throw new ShapeJsonError(`paths[${index}].fill: fill kind not drawn: ${fill.kind}`);
  for (const contour of path.contours) {
    tracePath(g, contour.outer);
    g.fill({ color: fill.color, alpha: fill.alpha });
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
function drawShape(shape: ShapeJson): Graphics {
  const g = new Graphics();
  shape.paths.forEach((path, i) => {
    drawFill(g, path, i);
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
  private errorElement: HTMLElement | null = null;
  private warnedOffsets = false;

  constructor(options: PixiBackendOptions = {}) {
    this.errorHost = options.errorHost;
  }

  async loadShape(symbolId: number, shape: ShapeJson, _assetBase: string): Promise<ShapeBounds> {
    // Throws ShapeJsonError on a fill that is not drawn; the loader shows it and does not start playback.
    const graphics = drawShape(shape);
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
