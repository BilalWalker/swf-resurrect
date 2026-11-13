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

/**
 * Every visible shape whose bounds contain the point (x, y), topmost first (the order in which `hitTest`
 * would meet them). Same coordinate rules as `hitTest`.
 */
export function hitTestAll<T extends HitNode>(root: T, x: number, y: number): T[] {
  const out: HitNode[] = [];
  collect(root, x, y, out);
  return out as T[];
}

function collect(node: HitNode, px: number, py: number, out: HitNode[]): void {
  if (!node.visible) return;
  if (node.scaleX === 0 || node.scaleY === 0) return;
  const rad = (node.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - node.x;
  const dy = py - node.y;
  const lx = (cos * dx + sin * dy) / node.scaleX;
  const ly = (-sin * dx + cos * dy) / node.scaleY;
  const children = node.children;
  if (children) {
    for (let i = children.length - 1; i >= 0; i--) collect(children[i]!, lx, ly, out);
  }
  const b = node.bounds;
  if (b && lx >= b.x && lx <= b.x + b.width && ly >= b.y && ly <= b.y + b.height) out.push(node);
}

/** Minimal view of a display object for the Hit_Target rule. `parent` is the Stage_Object (or null) for the root. */
export interface TargetNode<S = unknown> {
  readonly parent: TargetNode<S> | S | null;
  /** A Sprite or MovieClip (interactive in Ruffle's sense); a Shape is not. */
  readonly isContainer: boolean;
  /** Read only on containers. */
  readonly mouseEnabled: boolean;
  readonly mouseChildren: boolean;
}

type Pick<N> = { kind: 'hit'; target: N } | { kind: 'propagate' };

/**
 * The Hit_Target, following Ruffle's `mouse_pick_avm2` (core/src/display_object/movie_clip.rs) and
 * `Avm2MousePick::combine_with_parent` (core/src/display_object/interactive.rs) at the pinned commit.
 * `hits` are the shapes under the point, topmost first (`hitTestAll`). Per container the children that hold a
 * hit are tried interactive ones (containers) first, then non-interactive ones (shapes), each group in z-order;
 * a shape hit picks its container when that has `mouseEnabled`, else it propagates; a result is combined with
 * each container on the way up (`mouseChildren` false absorbs a hit; a propagate is absorbed by the first
 * enabled container). The root clip is never a target (Ruffle's loader root), so a result of the root, a
 * propagation out of the root and no hit at all give the Stage_Object.
 */
export function resolveHitTarget<N extends TargetNode<S>, S>(hits: readonly N[], stage: S): N | S {
  // Children of each container that hold a hit, in first-appearance (= z) order.
  const kids = new Map<N, N[]>();
  let top: N | null = null;
  for (const h of hits) {
    let c: N = h;
    let p = c.parent;
    if (p === null || p === stage) continue; // a shape directly on the stage has no container
    while (p !== null && p !== stage) {
      const container = p as N;
      let list = kids.get(container);
      if (!list) kids.set(container, (list = []));
      if (!list.includes(c)) list.push(c);
      c = container;
      p = c.parent;
    }
    top ??= c;
  }
  if (top === null) return stage;
  const root = top;

  const combine = (res: Pick<N>, k: N): Pick<N> => {
    if (res.kind === 'hit' && k.mouseChildren && res.target !== root) return res;
    return k.mouseEnabled ? { kind: 'hit', target: k } : { kind: 'propagate' };
  };
  const pick = (k: N): Pick<N> => {
    const list = kids.get(k) ?? [];
    let propagated = false;
    for (const c of [...list.filter((n) => n.isContainer), ...list.filter((n) => !n.isContainer)]) {
      const res: Pick<N> = c.isContainer
        ? pick(c)
        : k.mouseEnabled
          ? { kind: 'hit', target: k }
          : { kind: 'propagate' };
      if (res.kind === 'hit') return combine(res, k);
      propagated = true;
    }
    // A propagated result has lower priority than any hit of a sibling, so it is combined only after the loop.
    return propagated ? combine({ kind: 'propagate' }, k) : { kind: 'propagate' };
  };
  const result = pick(root);
  return result.kind === 'hit' && result.target !== root ? result.target : stage;
}
