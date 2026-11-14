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

async function run(
  toml: string,
  input = '[]',
  released: unknown[] = [],
): Promise<{ behaviour: any; problems: any[]; replayCalls: number }> {
  const ref = join(root, 'reference');
  await mkdir(ref, { recursive: true });
  await writeFile(join(ref, 'output.txt'), 'hello\n');
  await writeFile(join(ref, 'input.json'), input);
  await writeFile(join(ref, 'test.toml'), toml);
  let replayCalls = 0;
  const deps: Partial<VerifyDeps> = {
    exportReferenceFrames: async () => new Map(),
    replay: async () => {
      replayCalls++;
      return { lines: [{ text: 'hello', tick: 1 }], ticksRun: 3, error: null, releaseOutside: released } as never;
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
  return { behaviour: report.behaviour, problems: report.problems, replayCalls };
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

  it('copies sorted input notes and keeps release-outside out of problems', async () => {
    const input = JSON.stringify([{ type: 'MouseDown', x: 1, y: 1, btn: 'Left' }, { type: 'MouseUp', x: 5, y: 5, btn: 'Left' }, { type: 'KeyDown', key_code: 65 }]);
    const r = await run('num_frames = 3\n', input, [
      { upIndex: 1, downIndex: 0, pressed: 'root1.a', hit: 'stage', tick: 0 },
    ]);
    const notes = r.behaviour.replay.inputNotes as Array<{ kind: string; index: number }>;
    expect(notes.map((n) => n.kind)).toContain('release-outside');
    expect(notes.map((n) => n.index)).toEqual([...notes.map((n) => n.index)].sort((a, b) => a - b));
    expect(r.problems.map((p) => p.kind)).not.toContain('release-outside');
  });

  it('has an empty inputNotes list without notes', async () => {
    const r = await run('num_frames = 3\n');
    expect(r.behaviour.replay.inputNotes).toEqual([]);
  });
});

describe('verifyStage text-metrics limit follows the frame outcomes', () => {
  const solid = (r: number, g: number): { width: number; height: number; data: Uint8Array } => {
    const data = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) data.set([r, g, 0, 255], i * 4);
    return { width: 4, height: 4, data };
  };
  async function limitKinds(rendered: ReturnType<typeof solid> | null): Promise<string[]> {
    const deps: Partial<VerifyDeps> = {
      exportReferenceFrames: async () => new Map([[1, solid(255, 0)]]) as never,
      buildProject: async () => ({ distDir: root, dispose: async () => undefined }),
      renderFrames: async () => new Map(rendered === null ? [] : [[1, rendered]]) as never,
    };
    await verifyStage({
      swfPath: join(root, 'x.swf'),
      jarPath: 'none',
      outputDir: join(root, 'out'),
      projectDir: join(root, 'out'),
      scene: { formatVersion: 2, stage: { width: 4, height: 4, backgroundColor: '#ffffff', frameRate: 30 }, rootSymbolId: 0, symbols: {} } as never,
      unsupported: [
        { kind: 'text-metrics', id: 3, message: 'm' },
        { kind: 'gradient-fill', id: 4, message: 'g' },
      ] as never,
      translationReport: { formatVersion: 1, typeCheck: 'skipped', classes: [], omittedClasses: [], otherErrors: [], classPaths: [] } as never,
      sampleName: 's',
      referenceDir: null,
      deps,
    });
    const report = JSON.parse(await readFile(join(root, 'out', 'fidelity-report.json'), 'utf8'));
    return report.visual.knownVisualLimits.map((l: { kind: string }) => l.kind);
  }
  it('omits text-metrics when every compared frame is exact', async () => {
    expect(await limitKinds(solid(255, 0))).toEqual(['gradient-fill']);
  });
  it('keeps text-metrics when a compared frame differs', async () => {
    expect(await limitKinds(solid(0, 255))).toEqual(['gradient-fill', 'text-metrics']);
  });
  it('keeps text-metrics when no frame was compared', async () => {
    expect(await limitKinds(null)).toEqual(['gradient-fill', 'text-metrics']);
  });
});