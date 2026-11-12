import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyStage } from '../../src/verify/edge/verifyStage';
import type { VerifyDeps } from '../../src/verify/edge/verifyStage';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'verify-stage-test-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function run(toml: string): Promise<{ behaviour: { status: string; reason?: string }; replayCalls: number }> {
  const ref = join(root, 'reference');
  await mkdir(ref, { recursive: true });
  await writeFile(join(ref, 'output.txt'), 'hello\n');
  await writeFile(join(ref, 'input.json'), '[]');
  await writeFile(join(ref, 'test.toml'), toml);
  let replayCalls = 0;
  const deps: Partial<VerifyDeps> = {
    exportReferenceFrames: async () => new Map(),
    replay: async () => {
      replayCalls++;
      return { lines: [{ text: 'hello', tick: 1 }], ticksRun: 3, error: null } as never;
    },
  };
  await verifyStage({
    swfPath: join(root, 'x.swf'),
    jarPath: 'none',
    outputDir: join(root, 'out'),
    projectDir: join(root, 'out'),
    scene: { formatVersion: 1, stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 30 }, rootSymbolId: 0, symbols: {} } as never,
    unsupported: [],
    translationReport: { formatVersion: 1, typeCheck: 'skipped', classes: [], omittedClasses: [], otherErrors: [], classPaths: [] } as never,
    sampleName: 's',
    referenceDir: ref,
    deps,
  });
  const report = JSON.parse(await readFile(join(root, 'out', 'fidelity-report.json'), 'utf8'));
  return { behaviour: report.behaviour, replayCalls };
}

describe('verifyStage behaviour and tick_rate', () => {
  it('tick_rate gives not-compared: tick-rate and runs no Replay', async () => {
    const r = await run('tick_rate = 30\nnum_frames = 3\n');
    expect(r.behaviour.status).toBe('not-compared');
    expect(r.behaviour.reason).toBe('tick-rate');
    expect(r.replayCalls).toBe(0);
  });

  it('without tick_rate the Replay runs and the behaviour is compared', async () => {
    const r = await run('num_frames = 3\n');
    expect(r.behaviour.status).toBe('compared');
    expect(r.replayCalls).toBe(1);
  });
});
