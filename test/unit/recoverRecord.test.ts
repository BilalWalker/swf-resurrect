// Robustness 18.3 (Requirements 16.4, 16.7, 16.8): the recovery record, unrecoverable entries, the Named_Limit and the reason sentence.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import type { Clock } from '../../src/pipeline/guard';
import { recover } from '../../src/recover/recover';
import {
  classNameOfScript,
  hasSourceSignal,
  obfuscationRecoveredEntry,
  renamedIdentifiers,
  unrecoverableEntries,
  UNRECOVERABLE_MESSAGE,
  OBFUSCATION_RECOVERED_MESSAGE,
} from '../../src/recover/record';
import type { FfdecSpawner } from '../../src/unpack/spawnFfdec';
import { MN, TAG, abcTag, buildConstantPool, buildSwf, tag } from '../support/hostileSwf';

let tmp: string;
let nowMs: number;
const io = { out: () => undefined, err: () => undefined };
const clock: Clock = { now: () => nowMs, setTimeout: () => 0, clearTimeout: () => undefined };

const tc = (className: string) => ({
  className, fileName: `${className}.ts`, text: '', diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [],
});

function spawner(renamedInvalid: number | null): FfdecSpawner {
  return async (req) => {
    nowMs += 1000;
    const out = req.args[3];
    if (req.args[0] === '-renameInvalidIdentifiers' && renamedInvalid !== null) {
      // A renamed SWF whose scan would return fewer invalid names.
      const pool = buildConstantPool({
        multinames: [
          ...Array.from({ length: 20 }, (_, i) => ({ kind: MN.QName as number, name: `ok${i}` })),
          ...Array.from({ length: renamedInvalid }, (_, i) => ({ kind: MN.QName as number, name: `\u0001still${i}` })),
        ],
      });
      await writeFile(out, buildSwf({ tags: [tag(TAG.FileAttributes, [8, 0, 0, 0]), abcTag(72, pool)] }));
    } else {
      await writeFile(out, 'x');
    }
    return { stdout: '', stderr: '' };
  };
}

function stages(opts: { scripts: Record<string, string>; classes?: string[] } = { scripts: {} }): PipelineStages {
  return {
    recover: (i) => recover({ ...i, spawner: spawner(5), now: () => nowMs }),
    async unpack(i) {
      const scriptsDir = join(i.workDir, 'scripts');
      await mkdir(scriptsDir, { recursive: true });
      for (const [rel, text] of Object.entries(opts.scripts)) {
        const p = join(scriptsDir, rel);
        await mkdir(join(p, '..'), { recursive: true }).catch(() => undefined);
        await writeFile(p, text);
      }
      return { scriptsDir, structureDumpPath: '', symbolClassPath: null, shapesDir: '', textsDir: '', workDir: i.workDir, header: {} as never, xmlVersion: {} as never } as never;
    },
    async convert() {
      return {
        stagingDir: '', scenePath: '', shapePaths: [], imagePaths: [],
        scene: { formatVersion: 2, stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 24 }, rootSymbolId: 0, symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]] } } },
        unsupported: [], stats: { svgWritten: 0, morphSkipped: 0, declaredShapes: 0, placementsDropped: 0 },
      } as never;
    },
    async translate() {
      return { classes: (opts.classes ?? ['A', 'B']).map(tc), skippedScripts: [] };
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

const outcome = async () => JSON.parse(await readFile(join(tmp, 'out', 'outcome.json'), 'utf8'));
const unsupported = async () => JSON.parse(await readFile(join(tmp, 'out', 'unsupported-features.json'), 'utf8'));

beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'recover-record-')); nowMs = 0; });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

describe('recovery record helpers (18.3, pure)', () => {
  it('counts renamed identifiers as the original minus the renamed, clamped at 0', () => {
    expect(renamedIdentifiers(10, 3)).toBe(7);
    expect(renamedIdentifiers(5, 8)).toBe(0);
    expect(renamedIdentifiers(10, null)).toBe(0);
  });

  it('detects source signals and maps a .as path to a qualified name', () => {
    expect(hasSourceSignal('var x = §§push(1)')).toBe(true);
    expect(hasSourceSignal('var x = §§pop()')).toBe(true);
    expect(hasSourceSignal('class A {}')).toBe(false);
    expect(classNameOfScript('pkg/Name.as')).toBe('pkg.Name');
    expect(classNameOfScript('Name.as')).toBe('Name');
    expect(classNameOfScript('pkg/Name.ts')).toBe(null);
  });

  it('builds one unrecoverable entry per class, sorted, with the message', () => {
    const e = unrecoverableEntries(['B', 'A', 'B']);
    expect(e).toEqual([
      { kind: 'unrecoverable-class', tag: 'A', message: `A: ${UNRECOVERABLE_MESSAGE}` },
      { kind: 'unrecoverable-class', tag: 'B', message: `B: ${UNRECOVERABLE_MESSAGE}` },
    ]);
  });

  it('builds the obfuscation-recovered Named_Limit entry', () => {
    expect(obfuscationRecoveredEntry()).toEqual({ kind: 'obfuscation-recovered', message: OBFUSCATION_RECOVERED_MESSAGE });
  });
});

describe('recovery record in runPipeline (18.3)', () => {
  it('a recovered run fills the record and prefixes the reason with the recovery sentence', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 10));
    await runPipeline(args(), stages({ scripts: { 'A.as': 'class A {}', 'B.as': 'class B {}' } }), io);
    const o = await outcome();
    expect(o.outcome).toBe('converted');
    expect(o.recovery).toMatchObject({
      attempted: true, skipped: null, failedStep: null, fallback: false,
      deobfuscated: true, candidateClasses: 2, recoveredClasses: 2, unrecoverableClasses: 0,
    });
    // 10 original invalid names, renamed copy scans 5 → 5 renamed.
    expect(o.recovery.renamedIdentifiers).toBe(5);
    expect(o.reason).toBe('obfuscated: names renamed, 2 of 2 classes recovered');
    expect(o.obfuscated.sourceSignals).toBe(0);
  });

  it('counts unrecoverable classes and lists them plus the Named_Limit in unsupported-features.json', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 10));
    await runPipeline(
      args(),
      stages({ scripts: { 'A.as': 'class A {}', 'Bad.as': 'var x = §§push(1)', 'pkg/Inner.as': 'var y = §§pop()' }, classes: ['A', 'Bad', 'pkg.Inner'] }),
      io,
    );
    const o = await outcome();
    expect(o.recovery.unrecoverableClasses).toBe(2);
    expect(o.obfuscated.sourceSignals).toBe(2);
    const u = await unsupported();
    const kinds = u.entries.map((e: { kind: string }) => e.kind);
    expect(kinds.filter((k: string) => k === 'unrecoverable-class')).toHaveLength(2);
    expect(kinds).toContain('obfuscation-recovered');
    const unrec = u.entries.filter((e: { kind: string }) => e.kind === 'unrecoverable-class');
    expect(unrec.map((e: { tag: string }) => e.tag).sort()).toEqual(['Bad', 'pkg.Inner']);
    expect(unrec.every((e: { message: string }) => e.message.includes(UNRECOVERABLE_MESSAGE))).toBe(true);
    const limit = u.entries.find((e: { kind: string }) => e.kind === 'obfuscation-recovered');
    expect(limit.message).toBe(OBFUSCATION_RECOVERED_MESSAGE);
  });

  it('counts only Candidate_Classes: a source with the signals that is no candidate is not a gap', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 10));
    await runPipeline(args(), stages({ scripts: { 'A.as': 'class A {}', 'Bad.as': 'var x = §§push(1)', 'Helper.as': 'var y = §§pop()' }, classes: ['A', 'Bad'] }), io);
    const o = await outcome();
    expect(o.recovery.unrecoverableClasses).toBe(1);
    expect(o.obfuscated.sourceSignals).toBe(1);
    const u = await unsupported();
    expect(u.entries.filter((e: { kind: string }) => e.kind === 'unrecoverable-class').map((e: { tag: string }) => e.tag)).toEqual(['Bad']);
  });
  it('a fallback run has recoveredClasses 0, no Named_Limit and the ordinary reason', async () => {
    await writeFile(join(tmp, 'a.swf'), swfWithNames(20, 10));
    const failStages: PipelineStages = {
      ...stages({ scripts: { 'A.as': 'class A {}' } }),
      recover: (i) => recover({ ...i, spawner: async (req) => { nowMs += 1000; throw new Error('rename boom'); }, now: () => nowMs }),
    };
    await runPipeline(args(), failStages, io);
    const o = await outcome();
    expect(o.recovery).toMatchObject({ attempted: true, fallback: true, recoveredClasses: 0, candidateClasses: 2, deobfuscated: false });
    expect(o.reason).not.toContain('obfuscated: names renamed');
    expect(o.reason).toContain('2 of 2 classes translated');
    const u = await unsupported();
    expect(u.entries.map((e: { kind: string }) => e.kind)).not.toContain('obfuscation-recovered');
    expect(u.entries.map((e: { kind: string }) => e.kind)).not.toContain('unrecoverable-class');
  });
});
