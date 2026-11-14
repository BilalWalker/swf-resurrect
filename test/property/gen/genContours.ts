import fc from "fast-check";
import type { PathCmd } from "../../../template/runtime/shapeJson";

/** An axis-aligned rectangle with integer corners. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A forest of nested rectangles, shuffled, with random winding and start corner. Siblings never overlap. */
export interface ContourCase {
  rects: Rect[];
  subpaths: PathCmd[][];
}

interface TreeNode {
  children: TreeNode[];
}

const genNode = (depth: number): fc.Arbitrary<TreeNode> =>
  depth === 0
    ? fc.constant({ children: [] })
    : fc.record({ children: fc.array(fc.constant(0).chain(() => genNode(depth - 1)), { maxLength: 3 }) });

const SIZE = 1000;
const INSET = 2;

function layout(nodes: TreeNode[], box: Rect, out: Rect[]): void {
  const k = nodes.length;
  if (k === 0) return;
  const w = Math.floor((box.x1 - box.x0) / k);
  nodes.forEach((node, i) => {
    const r: Rect = {
      x0: box.x0 + i * w + INSET,
      y0: box.y0 + INSET,
      x1: box.x0 + (i + 1) * w - INSET,
      y1: box.y1 - INSET,
    };
    out.push(r);
    layout(node.children, r, out);
  });
}

function rectPath(r: Rect, reverse: boolean, start: number): PathCmd[] {
  let corners: Array<[number, number]> = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
  if (reverse) corners = corners.reverse();
  const rot = [...corners.slice(start), ...corners.slice(0, start)];
  return [
    ["M", rot[0][0], rot[0][1]],
    ["L", rot[1][0], rot[1][1]],
    ["L", rot[2][0], rot[2][1]],
    ["L", rot[3][0], rot[3][1]],
    ["Z"],
  ];
}

export const genContourCase: fc.Arbitrary<ContourCase> = fc
  .tuple(
    fc.array(genNode(3), { minLength: 1, maxLength: 3 }),
    fc.array(fc.tuple(fc.boolean(), fc.integer({ min: 0, max: 3 })), { minLength: 40, maxLength: 40 }),
    fc.infiniteStream(fc.integer({ min: 0, max: 1_000_000 })),
  )
  .map(([forest, styles, shuffle]) => {
    const rects: Rect[] = [];
    layout(forest, { x0: 0, y0: 0, x1: SIZE, y1: SIZE }, rects);
    const order = rects.map((_, i) => i);
    const it = shuffle[Symbol.iterator]();
    for (let i = order.length - 1; i > 0; i--) {
      const j = (it.next().value as number) % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const shuffled = order.map((i) => rects[i]);
    const subpaths = shuffled.map((r, i) => rectPath(r, styles[i % styles.length][0], styles[i % styles.length][1]));
    return { rects: shuffled, subpaths };
  });

export const SAMPLE_SPAN = SIZE;
