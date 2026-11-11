import type { ShapeBounds } from './backend';

/** Minimal structural view of a display object for hit testing. */
export interface HitNode {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Degrees. */
  rotation: number;
  visible: boolean;
  /** Ascending depth order; the last child is topmost. */
  readonly children?: readonly HitNode[];
  /** Present on shapes only, in shape-origin coordinates. */
  readonly bounds?: ShapeBounds;
}

/**
 * Returns the topmost visible shape whose bounds contain the point
 * (x, y), given in the root's parent space. Containers have no area.
 */
export function hitTest<T extends HitNode>(root: T, x: number, y: number): T | null {
  return hit(root, x, y) as T | null;
}

function hit(node: HitNode, px: number, py: number): HitNode | null {
  if (!node.visible) return null;

  const rad = (node.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Forward: p' = T + R * S * local. Inverse: local = S^-1 * R^-1 * (p - T).
  if (node.scaleX === 0 || node.scaleY === 0) return null;
  const dx = px - node.x;
  const dy = py - node.y;
  const lx = (cos * dx + sin * dy) / node.scaleX;
  const ly = (-sin * dx + cos * dy) / node.scaleY;

  const children = node.children;
  if (children) {
    for (let i = children.length - 1; i >= 0; i--) {
      const found = hit(children[i]!, lx, ly);
      if (found) return found;
    }
  }

  const b = node.bounds;
  if (b && lx >= b.x && lx <= b.x + b.width && ly >= b.y && ly <= b.y + b.height) {
    return node;
  }
  return null;
}
