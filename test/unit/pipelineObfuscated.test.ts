// Robustness task 17.2: the pipeline scans the ABC names after the Facts and before the first FFDec call,
// and writes the verdict to the Outcome_File.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { MN, TAG, abcTag, buildConstantPool, buildSwf, tag } from '../support/hostileSwf';

let tmp: string;
let calls: string[];
const io = { out: () => undefined, err: () => undefined };

const tc = (className: string) => ({
  className, fileName: `${className}.ts`, text: '', diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [],
});

function stages(unpackThrows: boolean): PipelineStages {
  return {
    async unpack() {
      calls.push('unpack');
      if (unpackThrows) throw new Error('unpack stopped');
      return {} as never;
    },
    async convert() {
      calls.push('convert');
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

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pipe-obf-'));
  calls = [];
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('obfuscated in the Outcome_File (task 17.2)', () => {
  it('records the counts and detected false for a clean file', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 0));
    await runPipeline(args(), stages(false), io);
    expect((await outcome()).obfuscated).toEqual({ detected: false, namesScanned: 20, invalidNames: 0, sourceSignals: null });
  });

  it('records detected true at 5 of 25 invalid names', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 5));
    await runPipeline(args(), stages(false), io);
    expect((await outcome()).obfuscated).toEqual({ detected: true, namesScanned: 25, invalidNames: 5, sourceSignals: null });
  });

  it('a file with no ABC tag gives detected false and zero counts', async () => {
    await writeFile(join(tmp, 'a.swf'), buildSwf());
    await runPipeline(args(), stages(false), io);
    expect((await outcome()).obfuscated).toEqual({ detected: false, namesScanned: 0, invalidNames: 0, sourceSignals: null });
  });

  it('a ZWS file gives null (detection did not run)', async () => {
    await writeFile(join(tmp, 'a.swf'), buildSwf({ signature: 'ZWS' }));
    await runPipeline(args(), stages(false), io);
    expect((await outcome()).obfuscated).toBeNull();
  });

  it('a refused file gives null and starts no stage', async () => {
    await writeFile(join(tmp, 'a.swf'), new TextEncoder().encode('not a movie at all'));
    await runPipeline(args(), stages(false), io);
    expect(calls).toEqual([]);
    expect((await outcome()).obfuscated).toBeNull();
  });

  it('the verdict is in the Outcome_File although the first FFDec stage fails, so the scan ran before it', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 5));
    await runPipeline(args(), stages(true), io);
    expect(calls).toEqual(['unpack']);
    const o = await outcome();
    expect(o.outcome).toBe('failed');
    expect(o.obfuscated).toMatchObject({ detected: true, namesScanned: 25, invalidNames: 5 });
  });
});
