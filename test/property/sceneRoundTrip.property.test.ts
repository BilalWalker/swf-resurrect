import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseScene, serialiseScene } from '../../src/convert/sceneJson';
import type { SceneEntry, SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { fcConfig } from './config';
function sceneWith(frameCount: number, scenes: SceneEntry[] | undefined, version: 2 | 3): SceneJson {
  const root: SpriteSymbol = {
    type: 'sprite',
    frameCount,
    frames: Array.from({ length: frameCount }, () => []),
    labels: [],
  };
  if (scenes !== undefined) root.scenes = scenes;
  return {
    formatVersion: version,
    stage: { width: 10, height: 10, backgroundColor: '#000000', frameRate: 12 },
    rootSymbolId: 0,
    symbols: { '0': root },
  };
}
// Feature: as3-coverage, Property 20: Scene goto and scene round trip (round-trip half)
describe('Property 20: scene list round trip', () => {
  const sceneLists = fc.integer({ min: 1, max: 40 }).chain((n) =>
    fc
      .uniqueArray(fc.integer({ min: 2, max: Math.max(2, n) }), { maxLength: 6 })
      .filter((xs) => n >= 2 || xs.length === 0)
      .chain((rest) =>
        fc
          .array(fc.string({ unit: 'binary', maxLength: 8 }), { minLength: rest.length + 1, maxLength: rest.length + 1 })
          .map((names): [number, SceneEntry[]] => {
            const firsts = [1, ...rest.filter((x) => x <= n)].sort((a, b) => a - b);
            return [n, firsts.map((firstFrame, i) => ({ name: names[i] ?? '', firstFrame }))];
          }),
      ),
  );
  it('writing then reading gives an equal list', () => {
    fc.assert(
      fc.property(sceneLists, ([n, scenes]) => {
        const back = parseScene(serialiseScene(sceneWith(n, scenes, 3)));
        expect((back.symbols['0'] as SpriteSymbol).scenes).toEqual(scenes);
        expect(back.formatVersion).toBe(3);
      }),
      fcConfig,
    );
  });
  it('a version 2 file reads as one scene at frame 1, and the writer writes version 3', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (n) => {
        const v2 = JSON.stringify(sceneWith(n, undefined, 2));
        const read = parseScene(v2);
        expect((read.symbols['0'] as SpriteSymbol).scenes).toEqual([{ name: 'Scene 1', firstFrame: 1 }]);
        expect(JSON.parse(serialiseScene(read)).formatVersion).toBe(3);
      }),
      fcConfig,
    );
  });
  it('rejects scenes in a version 2 file and version 1', () => {
    expect(() => parseScene(JSON.stringify(sceneWith(2, [{ name: 'a', firstFrame: 1 }], 2)))).toThrow('formatVersion 3');
    const v1 = { ...sceneWith(1, undefined, 2), formatVersion: 1 };
    expect(() => parseScene(JSON.stringify(v1))).toThrow('formatVersion');
  });
});
