import { Container, Graphics } from 'pixi.js';
import type { NodeHandle, RenderBackend, ShapeBounds } from '../backend';
import { flattenSvgWrapper } from '../svgFlatten';

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

  async loadShape(
    symbolId: number,
    svgText: string,
    origin: { x: number; y: number },
  ): Promise<ShapeBounds> {
    try {
      // Flatten the FFDec wrapper so paths are in shape-origin space whether or not Pixi honours it.
      const graphics = new Graphics().svg(flattenSvgWrapper(svgText));
      const b = graphics.getLocalBounds().rectangle;
      this.templates.set(symbolId, { graphics });
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch (err) {
      this.showError(`SVG asset ${symbolId}.svg failed to load`);
      throw err instanceof Error ? err : new Error(String(err));
    }
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
