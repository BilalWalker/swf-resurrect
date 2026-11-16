// Task 18.3: the committed entity_game Input_Script equals the builder output (Requirement 26.6).
// Validates: Requirements 24.3, 26.1, 26.6
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseNumFrames, planReplay } from '../../src/verify/core/replayPlan';
import { entityGameScript, playScript, scriptOptions, serialiseScript } from '../support/playScript';

const ref = resolve(fileURLToPath(new URL('../../', import.meta.url)), 'samples/entity_game/reference');

describe('entity_game Input_Script', () => {
  it('the committed input.json and options file equal the builder output', async () => {
    const script = playScript('entity_game');
    expect(JSON.parse(await readFile(resolve(ref, 'input.json'), 'utf8'))).toEqual(script.entries);
    expect((await readFile(resolve(ref, 'input.json'), 'utf8')).replace(/\r\n/g, '\n')).toBe(serialiseScript(script));
    expect((await readFile(resolve(ref, 'test.toml'), 'utf8')).replace(/\r\n/g, '\n')).toBe(scriptOptions(script));
  });

  it('plans without problems: a start click, held keys and fire, over 60 ticks', () => {
    const script = entityGameScript();
    const p = planReplay(JSON.stringify(script.entries), parseNumFrames(scriptOptions(script)));
    if ('error' in p) throw new Error(p.error);
    expect(p.problems).toEqual([]);
    expect(p.tickCount).toBe(60);
    expect(p.pressReleasePairs).toBe(1);
    expect(p.keys.map((k) => [k.tick, k.kind, k.keyCode])).toEqual([
      [5, 'down', 37], [5, 'down', 38], [10, 'down', 32], [50, 'up', 32], [55, 'up', 38], [55, 'up', 37],
    ]);
  });

  it('an unknown game has no script', () => {
    expect(() => playScript('nope')).toThrow();
  });
});
