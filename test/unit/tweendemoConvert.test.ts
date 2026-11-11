import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStructure } from '../../src/convert/ffdecXml';
import { resolveTimeline } from '../../src/convert/resolveTimeline';

const xml = readFileSync(new URL('../fixtures/tweendemo/structure.xml', import.meta.url), 'utf8');

describe('tweendemo fixture (FFDec 26.4.0 dump of samples/tweendemo/test.swf)', () => {
  const s = parseStructure(xml);
  const tl = resolveTimeline({ spriteId: 0, ops: s.root.ops, declaredFrameCount: s.root.declaredFrameCount });
  const at = (frame: number, depth: number) => tl.frames[frame - 1]?.find((e) => e.depth === depth);

  it('depth 10 on frame 1 has scale 0.6 and no rotation', () => {
    const m = at(1, 10)?.matrix;
    expect(m).toBeDefined();
    const [a, b, c, d, tx, ty] = m!;
    expect(a).toBeCloseTo(0.6, 3);
    expect(d).toBeCloseTo(0.6, 3);
    expect(b).toBe(0);
    expect(c).toBe(0);
    expect([tx, ty]).toEqual([60, 90]);
  });

  it('depth 10 on frame 43 is about [-1.4, 0, 0, -1.4, 490, 90]', () => {
    const m = at(43, 10)?.matrix;
    expect(m).toBeDefined();
    const [a, b, c, d, tx, ty] = m!;
    expect(a).toBeCloseTo(-1.4, 3);
    expect(d).toBeCloseTo(-1.4, 3);
    expect(b).toBeCloseTo(0, 3);
    expect(c).toBeCloseTo(0, 3);
    expect([tx, ty]).toEqual([490, 90]);
  });

  it('has frame labels start=1, middle=24, gone=44', () => {
    expect(tl.labels).toEqual(
      expect.arrayContaining([
        { name: 'start', frame: 1 },
        { name: 'middle', frame: 24 },
        { name: 'gone', frame: 44 },
      ]),
    );
  });

  it('has no depth 10 entry on frame 44', () => {
    expect(at(44, 10)).toBeUndefined();
  });
});
