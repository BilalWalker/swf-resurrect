// Task 29.4: the spacer Input_Script is our own and its committed input.json equals the builder output (Requirement 26.6).
// samples/spacer is a fetched sample: only input.json and test.toml are committed, never Ruffle output of the GPL SWF.
// Validates: Requirements 26.1, 26.6
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseNumFrames, planReplay } from '../../src/verify/core/replayPlan';
import { spacerScript, scriptOptions, serialiseScript } from '../support/playScript';
const ref = resolve(fileURLToPath(new URL('../../', import.meta.url)), 'samples/spacer/reference');
describe('spacer Input_Script', () => {
  it('the committed input.json and options file equal the builder output', async () => {
    const script = spacerScript();
    const text = (await readFile(resolve(ref, 'input.json'), 'utf8')).replace(/\r\n/g, '\n');
    expect(JSON.parse(text)).toEqual(script.entries);
    expect(text).toBe(serialiseScript(script));
    expect((await readFile(resolve(ref, 'test.toml'), 'utf8')).replace(/\r\n/g, '\n')).toBe(scriptOptions(script));
  });
  it('plans without problems and carries Enter, movement keys, a shot and the pause key', () => {
    const script = spacerScript();
    const p = planReplay(JSON.stringify(script.entries), parseNumFrames(scriptOptions(script)));
    if ('error' in p) throw new Error(p.error);
    expect(p.problems).toEqual([]);
    expect(p.tickCount).toBe(300);
    expect(p.pressReleasePairs).toBe(1);
    const downs = p.keys.filter((k) => k.kind === 'down').map((k) => k.keyCode);
    expect(downs).toEqual([13, 39, 40, 37, 38, 87, 68, 83, 65, 27, 27]);
  });
});
