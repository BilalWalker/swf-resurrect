// Single-frame SWF handling (breadth task 15.2, Requirement 14.18): the Frame_Sample of a one-frame SWF is [1] and
// the Verify_Stage compares that one frame.
// Validates: Requirements 14.18
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectFrames } from '../../src/verify/core/frameSample';
import { verifyStage } from '../../src/verify/edge/verifyStage';
import type { VerifyDeps } from '../../src/verify/edge/verifyStage';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'frame-sample-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('selectFrames for a one-frame SWF', () => {
  it('returns [1] for frame count 1, with and without a requested count', () => {
    expect(selectFrames(1)).toEqual([1]);
    expect(selectFrames(1, 8)).toEqual([1]);
  });
});

describe('verifyStage with a one-frame SWF', () => {
  it('compares exactly one frame', async () => {
    const solid = { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4).fill(255) };
    const requested: number[][] = [];
    const deps: Partial<VerifyDeps> = {
      exportReferenceFrames: async (...args: unknown[]) => {
        requested.push(args.flat().filter((a): a is number => typeof a === 'number'));
        return new Map([[1, solid]]) as never;
      },
      buildProject: async () => ({ distDir: root, dispose: async () => undefined }),
      renderFrames: async () => new Map([[1, solid]]) as never,
    };
    await verifyStage({
      swfPath: join(root, 'x.swf'),
      jarPath: 'none',
      outputDir: join(root, 'out'),
      projectDir: join(root, 'out'),
      scene: {
        formatVersion: 2,
        stage: { width: 4, height: 4, backgroundColor: '#ffffff', frameRate: 30 },
        rootSymbolId: 0,
        symbols: { 0: { type: 'sprite', frameCount: 1, frames: [[]], labels: {} } },
      } as never,
      unsupported: [],
      translationReport: { formatVersion: 1, typeCheck: 'skipped', classes: [], omittedClasses: [], otherErrors: [], classPaths: [] } as never,
      sampleName: 's',
      referenceDir: null,
      deps,
    });
    const report = JSON.parse(await readFile(join(root, 'out', 'fidelity-report.json'), 'utf8'));
    expect(report.visual.comparedFrames).toBe(1);
    expect(report.visual.frames).toHaveLength(1);
    expect(report.visual.frames[0].frame).toBe(1);
  });
});
