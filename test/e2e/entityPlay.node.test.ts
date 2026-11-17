// Node layer of the entity_game Play_Test (as3-coverage task 20.3). Runs the emitted project of the shared pipeline run.
// Validates: Requirements 25.1, 25.3, 25.4, 25.5, 25.8
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { nodeDriver } from '../support/playDriver';
import { playEntityGame, SEED_MATH_RANDOM } from '../support/playScenarios';
import { sharedPipelineRun } from '../support/sharedPipelineRun';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Named_Limits the entity_game Replay raised when measured (task 21.2). A new id here is a change to look at, not to wave through. */
const EXPECTED_NAMED_LIMITS = [
  'device-font-metrics',
  'filter-not-drawn:GlowFilter',
  'graphics-stroke-not-hit',
  'mouse-wheel-not-dispatched',
  'useWeakReference-ignored',
];

describe('entity_game Play_Test (Node layer)', () => {
  let outDir = '';
  beforeAll(async () => {
    const run = await sharedPipelineRun('entity_game', resolve(repoRoot, 'samples/entity_game/test.swf'));
    expect(run.code).toBe(0);
    outDir = run.outDir;
  }, 10 * 60 * 1000);

  it('plays 30 seconds: start, move, fire, hit a rock, no error', async () => {
    new Function(SEED_MATH_RANDOM)();
    const driver = await nodeDriver(outDir);
    const outcome = await playEntityGame(driver);
    expect(outcome.firstHit).not.toBeNull();
  }, 120_000);

  it('reports the Named_Limits of the run in the Fidelity_Report, with no unexpected id', async () => {
    const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as {
      behaviour: { namedLimits: Array<{ id: string; detail: string }> };
    };
    const ids = report.behaviour.namedLimits.map((l) => l.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !EXPECTED_NAMED_LIMITS.includes(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(await readFile(join(outDir, 'fidelity-report.html'), 'utf8')).toContain('Named limits raised while running');
  });
});
