// Task 18.2: key entries of a plan reach the Player through dispatchKey, at their tick, in order.
// Validates: Requirements 24.2, 24.5
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planReplay, type ReplayPlan } from '../../src/verify/core/replayPlan';
import { replay, type ReplayResult } from '../../src/verify/edge/replay';
import { emitFixtureProject, type EmittedFixtureProject } from '../support/emitFixtureProject';

/** Hand-written stand-in for the root class of the clickgoto fixture: records key events on the Stage. */
const RECORDING_ROOT = `import { Event, KeyboardEvent, MovieClip, trace } from '../shim';
export class MainTimeline extends MovieClip {
  private hooked: boolean = false;
  public constructor() {
    super();
    this.addEventListener(Event.ENTER_FRAME, this.onFrame);
  }
  private onFrame = (e: Event): void => {
    if (this.hooked || this.stage === null) return;
    this.hooked = true;
    this.stage.addEventListener(KeyboardEvent.KEY_DOWN, (k: KeyboardEvent): void => { trace('down ' + k.keyCode); });
    this.stage.addEventListener(KeyboardEvent.KEY_UP, (k: KeyboardEvent): void => { trace('up ' + k.keyCode); });
  };
}
`;

describe('Replay runner key entries', () => {
  let project: EmittedFixtureProject;
  let plan: ReplayPlan;
  let result: ReplayResult;

  beforeAll(async () => {
    project = await emitFixtureProject('clickgoto');
    await writeFile(resolve(project.projectDir, 'src', 'MainTimeline.ts'), RECORDING_ROOT, 'utf8');
    const entries = [
      { type: 'Wait' }, { type: 'Wait' }, { type: 'Wait' },
      { type: 'KeyDown', key: { Char: 'a' } }, { type: 'KeyDown', key: 'ArrowUp' }, { type: 'Wait' },
      { type: 'KeyUp', key: 'ArrowUp' }, { type: 'KeyUp', key: { Char: 'a' } },
    ];
    const planned = planReplay(JSON.stringify(entries), 6, 'num_frames');
    if ('error' in planned) throw new Error(planned.error);
    plan = planned;
    result = await replay(project.projectDir, plan);
  }, 240_000);

  afterAll(async () => {
    await project?.dispose();
  });

  it('plans the keys at ticks 3 and 4', () => {
    expect(plan.keys.map((k) => [k.tick, k.kind, k.keyCode])).toEqual([[3, 'down', 65], [3, 'down', 38], [4, 'up', 38], [4, 'up', 65]]);
  });

  it('delivers each key to a Stage listener at its tick, in order', () => {
    expect(result.error).toBeNull();
    expect(result.lines.filter((l) => /^(down|up) /.test(l.text))).toEqual([
      { tick: 3, text: 'down 65' }, { tick: 3, text: 'down 38' }, { tick: 4, text: 'up 38' }, { tick: 4, text: 'up 65' },
    ]);
  });
});
