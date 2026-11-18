import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildButton } from '../../src/convert/buttons';
import type { ButtonRecordModel } from '../../src/convert/model';
import { parseScene, serialiseScene } from '../../src/convert/sceneJson';
import { validateScene } from '../../template/runtime/scene';
import type { SceneJson } from '../../template/runtime/scene';
import { fcConfig } from './config';
import { genButtonRecords } from './gen/genButtonRecords';

const STATES = ['up', 'over', 'down', 'hit'] as const;

const sprite = { type: 'sprite', frameCount: 1, frames: [[]], labels: [] };
// Characters 1..20 are what the generated records refer to.
const characters = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), sprite]));
const sceneOf = (symbols: Record<string, unknown>): SceneJson =>
  ({
    formatVersion: 4,
    stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 12 },
    rootSymbolId: 0,
    symbols: { '0': sprite, ...characters, ...symbols },
  }) as unknown as SceneJson;

describe('button conversion and scene round trip', () => {
  // Feature: robustness, Property 23: Button symbol conversion and scene round trip
  // **Validates: Requirements 20.1, 20.2, 21.1, 21.2**
  it('Property 23: each record is in exactly the states whose flags are set, ordered by depth, and the scene round trips', () => {
    fc.assert(
      fc.property(genButtonRecords, fc.boolean(), (records: ButtonRecordModel[], trackAsMenu) => {
        const { symbol } = buildButton({ id: 100, trackAsMenu, hasActions: false, records });
        for (const s of STATES) {
          const list = symbol.states[s];
          const depths = list.map((e) => e.depth);
          expect(depths).toEqual([...new Set(depths)].sort((a, b) => a - b));
          // The later record at a depth wins; every depth with a flagged record appears once.
          const expected = new Map<number, number>();
          for (const r of records) if (r[s]) expected.set(r.depth, r.characterId);
          expect(list.map((e) => [e.depth, e.symbolId])).toEqual([...expected].sort((a, b) => a[0] - b[0]));
        }

        const withButton = sceneOf({ '100': symbol });
        const text = serialiseScene(withButton);
        expect(JSON.parse(text).formatVersion).toBe(4);
        const parsed = parseScene(text);
        expect(parsed.symbols['100']).toEqual(symbol);
        expect(serialiseScene(parsed)).toBe(text);

        const noButton = serialiseScene(sceneOf({}));
        expect(JSON.parse(noButton).formatVersion).toBe(3);
        expect(parseScene(noButton).formatVersion).toBe(3);
      }),
      fcConfig,
    );
  });

  it('the reader accepts versions 2, 3 and 4', () => {
    for (const v of [2, 3, 4]) expect(() => validateScene({ ...sceneOf({}), formatVersion: v })).not.toThrow();
  });
});
