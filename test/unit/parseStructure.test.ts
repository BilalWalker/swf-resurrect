import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStructure } from '../../src/convert/ffdecXml';

const xml = readFileSync(new URL('../fixtures/clickgoto/structure.xml', import.meta.url), 'utf8');

describe('parseStructure (clickgoto fixture)', () => {
  const s = parseStructure(xml);
  const frames = (ops: { kind: string }[]) => ops.filter((o) => o.kind === 'showFrame').length;

  it('reads background, shapes and sprite frames', () => {
    expect(s.background).toEqual({ r: 255, g: 255, b: 255 });
    expect(s.declaredShapeIds.sort()).toEqual([1, 2, 4, 5]);
    expect(s.morphShapeIds).toEqual([]);
    expect(s.sprites.map((x) => x.id).sort()).toEqual([3, 6]);
    for (const sp of s.sprites) {
      expect(frames(sp.ops)).toBe(2);
      expect(sp.declaredFrameCount).toBe(2);
    }
  });

  it('reads the root timeline placements in twips', () => {
    expect(s.root.declaredFrameCount).toBe(3);
    expect(frames(s.root.ops)).toBe(3);
    const places = s.root.ops.filter((o) => o.kind === 'place');
    expect(places).toContainEqual(
      expect.objectContaining({ depth: 1, characterId: 6, name: 'l_button', matrix: expect.objectContaining({ txTwips: 2870, tyTwips: 5400 }) }),
    );
    expect(places).toContainEqual(expect.objectContaining({ depth: 3, characterId: 3, name: 'r_button' }));
  });
});
