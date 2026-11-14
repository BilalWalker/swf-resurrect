import type { ColorTransform8 } from './scene';
import type { ShapeJson } from './shapeJson';

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
  /**
   * Builds the drawing of a shape from its Shape_JSON. assetBase is the URL prefix of the assets ("assets/"); an image
   * path of a bitmap fill is relative to it. Throws ShapeJsonError on a fill whose kind is not in DRAWN_FILLS.
   */
  loadShape(symbolId: number, shape: ShapeJson, assetBase: string): Promise<ShapeBounds>;
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
  /**
   * Draws a colour transform with offsets (multipliers, offsets and the alpha multiplier) by a filter on the node and
   * resets the multiplier state of setColorMultiplier; null removes the filter. The Player passes the transform with
   * the alpha add term already stripped (colourMatrix.ts, stripAlphaAdd).
   */
  setColorOffset(node: NodeHandle, ct: Readonly<ColorTransform8> | null): void;
  destroyNode(node: NodeHandle): void;
  /** On-page error text. */
  showError(message: string): void;
}
