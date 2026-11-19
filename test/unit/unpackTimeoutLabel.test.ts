// Robustness 18.3: an Unpack FFDec timeout's Outcome reason names the stage allowance (180 s by default).
// The pipeline must pass `${unpackS} s stage limit` as allowanceLabel (a prior commit dropped the interpolation).
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import type { Clock } from '../../src/pipeline/guard';
import { FfdecTimeoutError } from '../../src/unpack/errors';
import { MN, TAG, abcTag, buildConstantPool, buildSwf, tag } from '../support/hostileSwf';

let tmp: string;
const nowMs = 0;
const io = { out: () => undefined, err: () => undefined };
const clock: Clock = { now: () => nowMs, setTimeout: () => 0, clearTimeout: () => undefined };

const swfWithNames = (valid: number) =>
  buildSwf({
    tags: [
      tag(TAG.FileAttributes, [8, 0, 0, 0]),
      abcTag(72, buildConstantPool({ multinames: Array.from({ length: valid }, (_, i) => ({ kind: MN.QName as number, name: `ok${i}` })) })),
    ],
  });

function args(): PipelineArgs {
  return {
    swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
    templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp,
    workDir: join(tmp, 'work'), clock,
  };
}

/** Mimics the real unpack: an FFDec timeout carries the allowanceLabel it received. */
const stages = (): PipelineStages => ({
  async unpack(i) {
    const err = new FfdecTimeoutError(180);
    if (i.allowanceLabel !== undefined) err.limit = i.allowanceLabel;
    throw err;
  },
  async convert() {
    return { unsupported: [], scene: { formatVersion: 2, stage: { width: 10, height: 10, backgroundColor: '#fff', frameRate: 24 }, rootSymbolId: 0, symbols: {} }, stats: { svgWritten: 0, morphSkipped: 0, declaredShapes: 0, placementsDropped: 0 } } as never;
  },
  async translate() { return { classes: [], skippedScripts: [] }; },
  async emit(_a, o) { await import('node:fs/promises').then((f) => f.mkdir(o.outputDir, { recursive: true })); return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null }; },
  async typeCheck() { return { errors: [] } as never; },
});

beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'unpack-label-')); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

describe('Unpack FFDec timeout reason names the stage allowance (18.3)', () => {
  it('names 180 s stage limit by default', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20));
    await runPipeline(args(), stages(), io);
    const o = JSON.parse(await readFile(join(tmp, 'out', 'outcome.json'), 'utf8'));
    expect(o.outcome).toBe('refused');
    expect(o.reasonCode).toBe('time-limit');
    expect(o.reason).toContain('180 s stage limit');
  });
});
