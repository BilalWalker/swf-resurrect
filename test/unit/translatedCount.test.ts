// Task 12.3 (robustness Requirements 4.9, 4.10, 4.12, amended by owner decision): which classes count as translated.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClassOmission, OmissionReason } from '../../src/emit/classOmissions';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { buildSwf } from '../support/hostileSwf';

let tmp: string;
const io = { out: (_s: string) => {}, err: (_s: string) => {} };
const tc = (className: string, unsupported: boolean, parseFailed = false) => ({
  className, fileName: `${className}.ts`, text: '',
  diagnostics: unsupported ? [{ kind: 'unsupported-construct' as const, line: 3, message: 'no translation' }] : [],
  spans: [], extendsName: null, extendsQualified: null, importRecords: [],
  ...(parseFailed ? { parseFailed: true as const } : {}),
});

function stages(names: string[], unsupported: boolean, omissions: ClassOmission[], parseFailed = false): PipelineStages {
  return {
    async unpack() {
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
      return { classes: names.map((n) => tc(n, unsupported, parseFailed)), skippedScripts: [] };
    },
    async emit(_a, o) {
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [], omissions, loose: [], classPaths: [], gate: null };
    },
    async typeCheck() {
      return { errors: [] } as never;
    },
  };
}

const args = (): PipelineArgs => ({
  swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
  templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp,
});
const outcome = async () => JSON.parse(await readFile(join(tmp, 'out', 'outcome.json'), 'utf8'));
const om = (className: string, reason: OmissionReason): ClassOmission => ({ className, reason, symbolIds: [] });

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'translated-count-'));
  await writeFile(join(tmp, 'a.swf'), buildSwf());
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('translated count (Task 12.3)', () => {
  it('candidates that fail to parse or are omitted never count: refused nothing-translated', async () => {
    const omissions = [
      om('A', { kind: 'syntax-error', count: 1, firstLine: 2, firstMessage: 'x' }),
      om('B', { kind: 'bundler-parse', phase: 'parse', message: 'x', line: 1, column: 1 }),
      om('C', { kind: 'missing-source' }),
    ];
    const exit = await runPipeline(args(), stages(['A', 'B', 'C'], true, omissions), io);
    const o = await outcome();
    expect(o.numbers).toMatchObject({ candidateClasses: 3, translatedClasses: 0, untranslatedCodeClasses: 0, omittedClasses: 3 });
    expect(o).toMatchObject({ outcome: 'refused', reasonCode: 'nothing-translated' });
    expect(exit).toBe(3);
  });

  it('every candidate is a D5 fallback (registered, not omitted): refused nothing-translated, exit 3', async () => {
    const exit = await runPipeline(args(), stages(['A', 'B'], true, [], true), io);
    const o = await outcome();
    expect(o.numbers).toMatchObject({ candidateClasses: 2, translatedClasses: 0, untranslatedCodeClasses: 0, unparsedClasses: 2, omittedClasses: 0 });
    expect(o).toMatchObject({ outcome: 'refused', reasonCode: 'nothing-translated' });
    expect(exit).toBe(3);
  });

  it('one kept, registered class with untranslated code counts: converted-with-gaps, exit 0', async () => {
    const exit = await runPipeline(args(), stages(['A'], true, []), io);
    const o = await outcome();
    expect(o.numbers).toMatchObject({
      candidateClasses: 1, translatedClasses: 1, cleanClasses: 0, looseClasses: 0,
      untranslatedCodeClasses: 1, unsupportedClasses: 1, omittedClasses: 0,
    });
    expect(o.outcome).toBe('converted-with-gaps');
    expect(o.reason).toContain('1 of 1 classes translated (1 with untranslated code)');
    expect(exit).toBe(0);
  });

  it('an omitted unsupported class is not double counted as untranslated code', async () => {
    const exit = await runPipeline(
      args(),
      stages(['A', 'B'], true, [om('B', { kind: 'syntax-error', count: 1, firstLine: 1, firstMessage: 'x' })]),
      io,
    );
    const o = await outcome();
    expect(o.numbers).toMatchObject({ candidateClasses: 2, translatedClasses: 1, untranslatedCodeClasses: 1, omittedClasses: 1, unsupportedClasses: 2 });
    expect(exit).toBe(0);
  });
});
