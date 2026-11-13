// Task 22.6: a registered class that prints a line and then throws. The line is captured, the throw is a
// recorded Caught_Error and the Replay runs every planned tick.
// Validates: Requirements 25.7, 25.8, 31.3
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planReplay, type ReplayPlan } from '../../src/verify/core/replayPlan';
import { runtimeErrorProblems } from '../../src/verify/core/replayOutcome';
import { replay, type ReplayResult } from '../../src/verify/edge/replay';
import { emitFixtureProject, type EmittedFixtureProject } from '../support/emitFixtureProject';

const TICKS = 6;

/** Hand-written stand-in for the root class of the clickgoto fixture. */
const THROWING_ROOT = `import { MovieClip, trace } from '../shim';
export class MainTimeline extends MovieClip {
  public constructor() {
    super();
    trace('before the throw');
    throw new Error('fixture boom');
  }
}
`;

describe('Replay of a class that throws after printing a line', () => {
  let project: EmittedFixtureProject;
  let plan: ReplayPlan;
  let result: ReplayResult;

  beforeAll(async () => {
    project = await emitFixtureProject('clickgoto');
    const classFile = resolve(project.projectDir, 'src', 'MainTimeline.ts');
    await readFile(classFile, 'utf8'); // the translated root class is emitted here; fail loudly if not
    await writeFile(classFile, THROWING_ROOT, 'utf8');
    const planned = planReplay('[]', TICKS, 'num_ticks');
    if ('error' in planned) throw new Error(planned.error);
    plan = planned;
    result = await replay(project.projectDir, plan);
  }, 240_000);

  afterAll(async () => {
    await project?.dispose();
  });

  it('runs every planned tick without a replay-error', () => {
    expect(result.childFailure).toBe(false);
    expect(result.error).toBeNull();
    expect(plan.tickCount).toBe(TICKS);
    expect(result.ticksRun).toBe(TICKS);
  });

  it('captures the line printed before the throw', () => {
    expect(result.lines.filter((l) => l.text === 'before the throw')).toEqual([{ tick: 0, text: 'before the throw' }]);
  });

  it('records the throw once, at tick 0, with its site and message', () => {
    expect(result.caughtErrors).toEqual([{ tick: 0, site: 'constructor MainTimeline', message: 'fixture boom' }]);
    const problems = runtimeErrorProblems(result.caughtErrors ?? []);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('runtime-error');
  });
});
