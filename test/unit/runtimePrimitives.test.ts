import { describe, expect, it } from 'vitest';
import { hitTest, type HitNode } from '../../template/runtime/hitTest';
import { ScriptQueue } from '../../template/runtime/scriptQueue';
import { decomposeMatrix } from '../../template/runtime/stageTree';

function node(over: Partial<HitNode> & { name?: string } = {}): HitNode & { name?: string } {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, visible: true, ...over };
}
const box = { x: 0, y: 0, width: 10, height: 10 };

describe('ScriptQueue', () => {
  it('runs scripts in order and defers scripts enqueued while draining', () => {
    const q = new ScriptQueue();
    const log: string[] = [];
    const a = {
      frameScripts: new Map<number, () => void>([
        [
          1,
          () => {
            log.push('a1 start');
            q.enqueue(b, 1);
            q.drain();
            log.push('a1 end');
          },
        ],
      ]),
    };
    const b = { frameScripts: new Map<number, () => void>([[1, () => log.push('b1')]]) };
    q.enqueue(a, 1);
    q.drain();
    expect(log).toEqual(['a1 start', 'a1 end', 'b1']);
  });

  it('looks the script up at dequeue time', () => {
    const q = new ScriptQueue();
    const log: string[] = [];
    const scripts = new Map<number, () => void>([[1, () => log.push('old')]]);
    q.enqueue({ frameScripts: scripts }, 1);
    scripts.set(1, () => log.push('new'));
    q.drain();
    expect(log).toEqual(['new']);
  });

  it('skips frames with no script', () => {
    const q = new ScriptQueue();
    q.enqueue({ frameScripts: new Map() }, 3);
    expect(() => q.drain()).not.toThrow();
    expect(q.size).toBe(0);
  });
});

describe('decomposeMatrix', () => {
  it('flags a skewed matrix and keeps scale and rotation from the first column', () => {
    const { t, skewed } = decomposeMatrix([1, 0, 1, 1, 3, 4]);
    expect(skewed).toBe(true);
    expect(t.scaleX).toBe(1);
    expect(t.x).toBe(3);
  });

  it('does not flag a pure rotation and scale', () => {
    expect(decomposeMatrix([0, 2, -3, 0, 0, 0]).skewed).toBe(false);
    expect(decomposeMatrix([1, 0, 0, 1, 0, 0]).skewed).toBe(false);
  });
});

describe('hitTest', () => {
  it('returns the topmost shape and ignores containers', () => {
    const low = node({ bounds: box });
    const high = node({ bounds: box });
    const root = node({ children: [low, high] });
    expect(hitTest(root, 5, 5)).toBe(high);
  });

  it('skips invisible nodes and returns null on a miss', () => {
    const low = node({ bounds: box });
    const high = node({ bounds: box, visible: false });
    const root = node({ children: [low, high] });
    expect(hitTest(root, 5, 5)).toBe(low);
    expect(hitTest(root, 50, 5)).toBeNull();
  });

  it('applies the inverse of translation, scale and rotation', () => {
    const shape = node({ bounds: box });
    const parent = node({ x: 100, y: 0, scaleX: 2, scaleY: 2, rotation: 90, children: [shape] });
    const root = node({ children: [parent] });
    // local (5, 5) -> scaled (10, 10) -> rotated 90deg (-10, 10) -> translated (90, 10)
    expect(hitTest(root, 90, 10)).toBe(shape);
    expect(hitTest(root, 110, 10)).toBeNull();
  });
});
