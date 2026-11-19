// Robustness task 18.2 (Requirements 15.3, 16.1, 16.2, 16.9; Property 17): order of scan, recover, one Unpack, fallback.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import type { Clock } from '../../src/pipeline/guard';
import { recover } from '../../src/recover/recover';
import { FfdecExitError } from '../../src/unpack/errors';
import type { FfdecSpawner } from '../../src/unpack/spawnFfdec';
import { MN, TAG, abcTag, buildConstantPool, buildSwf, tag } from '../support/hostileSwf';

let tmp: string;
let calls: string[];
let unpackPaths: string[];
let nowMs: number;
const io = { out: () => undefined, err: () => undefined };

const clock: Clock = { now: () => nowMs, setTimeout: () => 0, clearTimeout: () => undefined };

const tc = (className: string) => ({
  className, fileName: `${className}.ts`, text: '', diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [],
});

/** Fake FFDec: records the call, advances the clock, writes the output file unless the step is told to fail. */
function spawner(failStep: 'rename' | 'deobfuscate' | null, costMs: number): FfdecSpawner {
  return async (req) => {
    const step = req.args[0] === '-renameInvalidIdentifiers' ? 'rename' : 'deobfuscate';
    calls.push(`${step}:${req.args[2]}->${req.args[3]}`);
    nowMs += costMs;
    if (failStep === step) throw new FfdecExitError(1, 'boom');
    await writeFile(req.args[3], 'x');
    return { stdout: '', stderr: '' };
  };
}

function stages(failStep: 'rename' | 'deobfuscate' | null, costMs = 1000): PipelineStages {
  return {
    recover: (i) => recover({ ...i, spawner: spawner(failStep, costMs), now: () => nowMs }),
    async unpack(i) {
      calls.push('unpack');
      unpackPaths.push(i.swfPath);
      return {} as never;
    },
    async convert() {
      return {
        stagingDir: '', scenePath: '', shapePaths: [], imagePaths: [],
        scene: { formatVersion: 2, stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 24 }, rootSymbolId: 0, symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]] } } },
        unsupported: [],
        stats: { svgWritten: 0, morphSkipped: 0, declaredShapes: 0, placementsDropped: 0 },
      } as never;
    },
    async translate() {
      return { classes: [tc('A')], skippedScripts: [] };
    },
    async emit(_a, o) {
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null };
    },
    async typeCheck() {
      return { errors: [] } as never;
    },
  };
}

function args(): PipelineArgs {
  return {
    swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
    templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp,
    workDir: join(tmp, 'work'), clock,
  };
}

const outcome = async () => JSON.parse(await readFile(join(tmp, 'out', 'outcome.json'), 'utf8'));

const swfWithNames = (valid: number, invalid: number) =>
  buildSwf({
    tags: [
      tag(TAG.FileAttributes, [8, 0, 0, 0]),
      abcTag(72, buildConstantPool({
        multinames: [
          ...Array.from({ length: valid }, (_, i) => ({ kind: MN.QName as number, name: `ok${i}` })),
          ...Array.from({ length: invalid }, (_, i) => ({ kind: MN.QName as number, name: `\u0001bad${i}` })),
        ],
      })),
    ],
  });

const unpackCount = () => calls.filter((c) => c === 'unpack').length;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'recover-order-'));
  calls = [];
  unpackPaths = [];
  nowMs = 0;
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('recovery order in runPipeline (task 18.2)', () => {
  it('a clean file: one Unpack on the input, no rename, no deobfuscate, no recovery record', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 0));
    await runPipeline(args(), stages(null), io);
    expect(calls).toEqual(['unpack']);
    expect(unpackPaths).toEqual([join(tmp, 'a.swf')]);
    expect((await outcome()).recovery).toBeNull();
  });

  it('an obfuscated file: rename, deobfuscate, then one Unpack on the recovered copy', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 5));
    await runPipeline(args(), stages(null), io);
    const dir = join(tmp, 'work', 'recovery');
    expect(calls).toEqual([
      `rename:${join(dir, 'in.swf')}->${join(dir, 'renamed.swf')}`,
      `deobfuscate:${join(dir, 'renamed.swf')}->${join(dir, 'recovered.swf')}`,
      'unpack',
    ]);
    expect(unpackPaths).toEqual([join(dir, 'recovered.swf')]);
    const o = await outcome();
    expect(o.recovery).toMatchObject({ attempted: true, fallback: false, failedStep: null });
  });

  for (const step of ['rename', 'deobfuscate'] as const) {
    it(`a failed ${step} with enough time: one Unpack on the original, fallback true`, async () => {
      await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 5));
      await runPipeline(args(), stages(step), io);
      expect(unpackCount()).toBe(1);
      expect(unpackPaths).toEqual([join(tmp, 'a.swf')]);
      expect(calls.indexOf('unpack')).toBe(calls.length - 1);
      const o = await outcome();
      expect(o.outcome).not.toBe('refused');
      expect(o.recovery).toMatchObject({ attempted: true, fallback: true, failedStep: step });
    });

    it(`a failed ${step} with too little time: refused time-limit, no Unpack`, async () => {
      await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 5));
      // The failing call uses 250 s of the 300 s run limit; 50 s are left, the unpack allowance is 180 s.
      await runPipeline(args(), stages(step, 250_000), io);
      expect(unpackCount()).toBe(0);
      const o = await outcome();
      expect(o.outcome).toBe('refused');
      expect(o.reasonCode).toBe('time-limit');
      expect(o.reason).toContain('run limit');
      expect(o.recovery).toMatchObject({ attempted: true, fallback: true, failedStep: step });
    });
  }
});
