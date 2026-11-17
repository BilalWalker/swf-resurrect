// Node layer of the spacer Play_Test (as3-coverage task 31, Requirement 25.2): the proof that spacer PLAYS. Runs the emitted
// project of the shared pipeline run on a FakeBackend and a ManualClock. Skipped with the fetch message when the SWF is absent.
// SWF_RESURRECT_PLAY_DIR (a project directory) replaces the shared run: used to mutation-check the assertions on a scratch copy.
// Validates: Requirements 25.1, 25.2, 25.3, 25.4, 25.5, 25.8
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { describeIfSpacer, spacerSwfPath } from '../support/fetchedSpacer';
import { nodeDriver } from '../support/playDriver';
import { flyLabelsOf, HANDWRITTEN_SPACER, playSpacer, SEED_MATH_RANDOM, SPACER_EXPECTED_NAMED_LIMITS } from '../support/playScenarios';
import { sharedPipelineRun } from '../support/sharedPipelineRun';


describeIfSpacer('spacer Play_Test (Node layer)', () => {
  if (!existsSync(HANDWRITTEN_SPACER)) {
    it.skip(`needs ${HANDWRITTEN_SPACER} (the hand-written KeyObject and PhysicEngine)`, () => undefined);
    return;
  }
  let outDir = '';
  beforeAll(async () => {
    const override = process.env.SWF_RESURRECT_PLAY_DIR;
    if (override !== undefined && override !== '') {
      outDir = override;
      return;
    }
    const run = await sharedPipelineRun('spacer', spacerSwfPath());
    expect([0, 1]).toContain(run.code);
    outDir = run.outDir;
  }, 15 * 60 * 1000);

  it('loads with no omitted class and a type gate that ran', () => {
    const report = JSON.parse(readFileSync(join(outDir, 'translation-report.json'), 'utf8')) as {
      typeCheck: string;
      omittedClasses: unknown[];
      otherErrors: unknown[];
      classes: Array<{ className: string; omitted: boolean; typeErrors: unknown[] }>;
    };
    expect(report.typeCheck).toBe('ran');
    expect(report.omittedClasses).toEqual([]);
    expect(report.classes.filter((c) => c.omitted)).toEqual([]);
    expect(report.classes.filter((c) => c.typeErrors.length > 0).map((c) => c.className)).toEqual([]);
    expect(report.otherErrors).toEqual([]);
  });

  it('plays 30 seconds: start, move inside the bounds, shoot, kill a Fly, pause, no error', async () => {
    new Function(SEED_MATH_RANDOM)();
    const driver = await nodeDriver(outDir);
    const outcome = await playSpacer(driver, flyLabelsOf(readFileSync(join(outDir, 'assets', 'scene.json'), 'utf8')));
    console.log(`spacer play: ${JSON.stringify({ ...outcome, death: { ...outcome.death, trace: outcome.death.trace.length } })}`);
    expect(outcome.death.goneTick).toBeGreaterThan(outcome.death.hitTick);
    // Named_Limits raised at load and during the 30 seconds: only the expected ids.
    expect(outcome.namedLimits.filter((id) => !SPACER_EXPECTED_NAMED_LIMITS.includes(id))).toEqual([]);
  }, 300_000);

});
