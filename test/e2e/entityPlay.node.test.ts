// Node layer of the entity_game Play_Test (as3-coverage task 20.3). Runs the emitted project of the shared pipeline run.
// Validates: Requirements 25.1, 25.3, 25.4, 25.5, 25.8
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { nodeDriver } from '../support/playDriver';
import { playEntityGame, SEED_MATH_RANDOM } from '../support/playScenarios';
import { sharedPipelineRun } from '../support/sharedPipelineRun';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

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
});
