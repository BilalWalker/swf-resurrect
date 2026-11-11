/** Opaque handle to a backend display node. */
export type NodeHandle = unknown;

/** Shape bounds in shape-origin coordinates. */
export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The only surface the PixiJS adapter implements. */
export interface RenderBackend {
  loadShape(symbolId: number, svgText: string, origin: { x: number; y: number }): Promise<ShapeBounds>;
  createContainer(): NodeHandle;
  createShape(symbolId: number): NodeHandle;
  addChildAt(parent: NodeHandle, child: NodeHandle, index: number): void;
  removeChild(parent: NodeHandle, child: NodeHandle): void;
  setTransform(
    node: NodeHandle,
    t: { x: number; y: number; scaleX: number; scaleY: number; rotationDeg: number },
  ): void;
  setAlpha(node: NodeHandle, alpha: number): void;
  setVisible(node: NodeHandle, visible: boolean): void;
  setColorMultiplier(node: NodeHandle, r: number, g: number, b: number, a: number): void;
  /** Called when a colour transform has non-zero offsets, which the backend cannot draw. May be called repeatedly. */
  warnColorOffsetsUnsupported?(): void;
  destroyNode(node: NodeHandle): void;
  /** On-page error text. */
  showError(message: string): void;
}
