// Required test (verify Requirement 13.1): Replay of the clickgoto emitted project against its Reference_Trace.
// Validates: Requirements 6.10, 6.13, 6.14, 13.1, 13.5

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseNumFrames, planReplay, type ReplayPlan } from '../../src/verify/core/replayPlan';
import { compareTraces } from '../../src/verify/core/traceCompare';
import { splitTraceLines } from '../../src/verify/core/traceFormat';
import { replay, type ReplayResult } from '../../src/verify/edge/replay';
import { emitFixtureProject, type EmittedFixtureProject } from '../support/emitFixtureProject';

/** Measured Trace_Score (task 18.1: 676 matched, 0 missing, 0 extra; was 98.37 at task 12.7); never lowered. */
const TRACE_SCORE_FLOOR = 100;

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const refDir = resolve(repoRoot, 'samples/clickgoto/reference');
const refFiles = ['output.txt', 'input.json', 'test.toml'].map((f) => resolve(refDir, f));

async function hashes(): Promise<string[]> {
  const out: string[] = [];
  for (const f of refFiles) out.push(createHash('sha256').update(await readFile(f)).digest('hex'));
  return out;
}

describe('clickgoto Replay', () => {
  let project: EmittedFixtureProject;
  let plan: ReplayPlan;
  let first: ReplayResult;
  let second: ReplayResult;
  let before: string[];
  let after: string[];
  let referenceLines: string[];
  let groups = 0;

  beforeAll(async () => {
    before = await hashes();
    project = await emitFixtureProject('clickgoto');
    const inputJson = await readFile(resolve(refDir, 'input.json'), 'utf8');
    const toml = await readFile(resolve(refDir, 'test.toml'), 'utf8');
    referenceLines = splitTraceLines(await readFile(resolve(refDir, 'output.txt'), 'utf8'));
    const entries = JSON.parse(inputJson) as Array<{ type: string }>;
    groups = entries.filter((e) => e.type === 'Wait').length + (entries[entries.length - 1]?.type === 'Wait' ? 0 : 1);
    const planned = planReplay(inputJson, parseNumFrames(toml));
    if ('error' in planned) throw new Error(planned.error);
    plan = planned;
    first = await replay(project.projectDir, plan);
    second = await replay(project.projectDir, plan);
    after = await hashes();
  }, 240_000);

  afterAll(async () => {
    await project?.dispose();
  });

  it('plans 32 ticks and five clicks at ticks 3, 7, 12, 14, 20', () => {
    expect(plan.problems).toEqual([]);
    expect(plan.tickCount).toBe(32);
    expect(plan.clicks.map((c) => c.tick)).toEqual([3, 7, 12, 14, 20]);
    expect(groups).toBe(21);
  });

  it('runs 32 ticks without error', () => {
    expect(first.error).toBeNull();
    expect(first.ticksRun).toBe(32);
  });

  it('delivers each click to the intended button in the intended tick', () => {
    const ticksOf = (prefix: string): number[] => [
      ...new Set(first.lines.filter((l) => l.text.startsWith(prefix)).map((l) => l.tick)),
    ];
    expect(ticksOf('///(LeftButton clicked')).toEqual([3, 12, 20]);
    expect(ticksOf('///(RightButton clicked')).toEqual([7, 14]);
  });

  it('two Replays give equal lines', () => {
    expect(second.lines).toEqual(first.lines);
  });

  it('leaves the reference files byte-unchanged', () => {
    expect(after).toEqual(before);
  });

  it('runs a Goto_Extra_Cycle at each click tick (G7)', () => {
    // KNOWN_BEHAVIOUR_GAPS is empty, so the cycle must be present: frameConstructed, then the
    // frame script (when the frame changed), then exitFrame, then the Container lines.
    for (const tick of [3, 7, 12, 14, 20]) {
      const texts = first.lines.filter((l) => l.tick === tick).map((l) => l.text);
      const click = texts.findIndex((t) => t.includes('clicked'));
      expect(click).toBeGreaterThanOrEqual(0);
      const after = texts.slice(click);
      const fc = after.findIndex((t) => t.includes('type="frameConstructed"'));
      const ex = after.findIndex((t) => t.includes('type="exitFrame"'));
      expect(fc).toBeGreaterThan(0);
      expect(ex).toBeGreaterThan(fc);
      expect(after.slice(ex).some((t) => t.startsWith('/// (Container: root1'))).toBe(true);
    }
  });

  it('meets the Trace_Score floor', () => {
    const cmp = compareTraces(referenceLines, first.lines.map((l) => l.text));
    expect(cmp.kind).toBe('compared');
    if (cmp.kind !== 'compared') return;
    expect(cmp.traceScore).toBeGreaterThanOrEqual(TRACE_SCORE_FLOOR);
  });
});
