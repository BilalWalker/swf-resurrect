import type { NodeHandle, RenderBackend, ShapeBounds } from '../../template/runtime/backend';

export interface FakeNode {
  id: number;
  kind: 'container' | 'shape';
  symbolId: number | null;
  children: FakeNode[];
  parent: FakeNode | null;
  transform: { x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number };
  alpha: number;
  visible: boolean;
  colorMultiplier: [number, number, number, number] | null;
  destroyed: boolean;
}

/** In-memory RenderBackend that records the node tree and the errors shown. */
export class FakeBackend implements RenderBackend {
  readonly nodes: FakeNode[] = [];
  readonly errors: string[] = [];
  readonly shapeBounds = new Map<number, ShapeBounds>();

  async loadShape(symbolId: number, _svgText: string, origin: { x: number; y: number }): Promise<ShapeBounds> {
    const bounds = this.shapeBounds.get(symbolId) ?? { x: -origin.x, y: -origin.y, width: 10, height: 10 };
    this.shapeBounds.set(symbolId, bounds);
    return bounds;
  }

  createContainer(): FakeNode {
    return this.make('container', null);
  }

  createShape(symbolId: number): FakeNode {
    return this.make('shape', symbolId);
  }

  addChildAt(parent: NodeHandle, child: NodeHandle, index: number): void {
    const p = parent as FakeNode;
    const c = child as FakeNode;
    c.parent?.children.splice(c.parent.children.indexOf(c), 1);
    p.children.splice(Math.max(0, Math.min(index, p.children.length)), 0, c);
    c.parent = p;
  }

  removeChild(parent: NodeHandle, child: NodeHandle): void {
    const p = parent as FakeNode;
    const c = child as FakeNode;
    const i = p.children.indexOf(c);
    if (i >= 0) p.children.splice(i, 1);
    c.parent = null;
  }

  setTransform(node: NodeHandle, t: FakeNode['transform']): void {
    (node as FakeNode).transform = { ...t };
  }

  setAlpha(node: NodeHandle, alpha: number): void {
    (node as FakeNode).alpha = alpha;
  }

  setVisible(node: NodeHandle, visible: boolean): void {
    (node as FakeNode).visible = visible;
  }

  setColorMultiplier(node: NodeHandle, r: number, g: number, b: number, a: number): void {
    (node as FakeNode).colorMultiplier = [r, g, b, a];
  }

  destroyNode(node: NodeHandle): void {
    markDestroyed(node as FakeNode);
  }

  showError(message: string): void {
    this.errors.push(message);
  }

  offsetWarnings = 0;

  warnColorOffsetsUnsupported(): void {
    this.offsetWarnings++;
  }

  /** Nodes not destroyed. */
  get liveNodes(): FakeNode[] {
    return this.nodes.filter((n) => !n.destroyed);
  }

  private make(kind: FakeNode['kind'], symbolId: number | null): FakeNode {
    const node: FakeNode = {
      id: this.nodes.length,
      kind,
      symbolId,
      children: [],
      parent: null,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 },
      alpha: 1,
      visible: true,
      colorMultiplier: null,
      destroyed: false,
    };
    this.nodes.push(node);
    return node;
  }
}

function markDestroyed(node: FakeNode): void {
  node.destroyed = true;
  for (const c of node.children) markDestroyed(c);
}
