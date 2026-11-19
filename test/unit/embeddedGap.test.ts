// Task 27.2 (robustness Requirement 26.7, design D-D3b): the embedded-swf gap kind, its sentence and Outcome_File field.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTED_GAP_KINDS, summariseGaps } from '../../src/outcome/gaps';
import { decideOutcome } from '../../src/outcome/outcome';
import type { OutcomeNumbers, RunRecord } from '../../src/outcome/outcome';
import { parseOutcome, serialiseOutcome } from '../../src/outcome/outcomeFile';
import { MAX_REASON_LENGTH, wrapperStatement } from '../../src/outcome/reasons';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { toOutcomeRecord } from '../property/gen/genRunRecord';
import { TAG, binaryDataTag, buildSwf, embeddedSwfBytes, tag } from '../support/hostileSwf';

const numbers: OutcomeNumbers = {
  candidateClasses: 5, translatedClasses: 5, cleanClasses: 5, looseClasses: 0, untranslatedCodeClasses: 0, unparsedClasses: 0,
  unsupportedClasses: 0, omittedClasses: 0, typeErrors: 0, droppedPlacements: 0, namedLimits: 0, stubDependentClasses: 0, consideredClasses: 5, totalClasses: 5, notConsideredClasses: 0,
};
const limits = { maxSizeMiB: 20, runLimitS: 300, stageLimitS: 60, stageWeights: {} };
const summary = { count: 1, totalBytes: 7349081, largestBytes: 7349081 };
const record = (embedded: boolean): RunRecord => ({
  facts: null, stages: [], failure: null, numbers, limits, recovery: null,
  gaps: embedded ? summariseGaps([], { embeddedSwfs: { count: 1, examples: ['id 46: CWS v10, 7349081 bytes'] } }) : [],
  embeddedSwfs: embedded ? summary : null,
});

describe('embedded-swf gap', () => {
  it('is a counted kind with the count of embedded SWFs and at most 5 generic examples', () => {
    expect(COUNTED_GAP_KINDS).toContain('embedded-swf');
    const examples = Array.from({ length: 8 }, (_, i) => `id ${i}: FWS v10, 99 bytes`);
    expect(summariseGaps([], { embeddedSwfs: { count: 8, examples } })).toEqual([{ kind: 'embedded-swf', count: 8, examples: examples.slice(0, 5) }]);
    expect(summariseGaps([], { embeddedSwfs: { count: 0, examples: [] } })).toEqual([]);
  });
  it('a wrapper never ends plain converted; the sentence leads with the wrapper', () => {
    const d = decideOutcome(record(true));
    expect(d.outcome).toBe('converted-with-gaps');
    expect(d.reason).toBe('the file is a wrapper around another SWF that was not converted (1 embedded, 7.0 MiB); 5 of 5 classes translated, 0 type errors');
    expect(d.reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
    expect(decideOutcome(record(false))).toMatchObject({ outcome: 'converted', reason: '5 of 5 classes translated' });
  });
  it('stays within 200 characters with a recovery prefix and other gaps', () => {
    const r = record(true);
    r.numbers = { ...numbers, typeErrors: 99999, candidateClasses: 99999, translatedClasses: 99999 };
    r.gaps = summariseGaps([{ kind: 'flash-api-gap' }], { typeErrors: 99999, embeddedSwfs: { count: 3, examples: [] } });
    r.recovery = { attempted: true, skipped: null, failedStep: null, fallback: false, renamedIdentifiers: 1, deobfuscated: true, candidateClasses: 99999, recoveredClasses: 99999, unrecoverableClasses: 0 };
    expect(decideOutcome(r).reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
    expect(wrapperStatement({ count: 2, totalBytes: null })).toBe('the file is a wrapper around another SWF that was not converted (2 embedded); ');
  });
  it('the Outcome_File carries embeddedSwfs only when found, and the parser reads files without it', () => {
    const withIt = toOutcomeRecord(record(true));
    const without = toOutcomeRecord(record(false));
    expect(JSON.parse(serialiseOutcome(withIt)).embeddedSwfs).toEqual(summary);
    expect('embeddedSwfs' in JSON.parse(serialiseOutcome(without))).toBe(false);
    expect(parseOutcome(serialiseOutcome(without)).formatVersion).toBe(1);
    expect(parseOutcome(serialiseOutcome(withIt)).embeddedSwfs).toEqual(summary);
  });
});

describe('embedded-swf in the pipeline', () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), 'pipe-emb-')); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });
  const tc = (className: string) => ({ className, fileName: `${className}.ts`, text: '', diagnostics: [], spans: [], extendsName: null, extendsQualified: null, importRecords: [] });
  const stages = (): PipelineStages => ({
    async unpack() { return {} as never; },
    async convert() {
      return {
        stagingDir: '', scenePath: '', shapePaths: [], imagePaths: [],
        scene: { formatVersion: 2, stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 24 }, rootSymbolId: 0, symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]] } } },
        unsupported: [], stats: { svgWritten: 0, morphSkipped: 0, declaredShapes: 0, placementsDropped: 0 },
      } as never;
    },
    async translate() { return { classes: [tc('A')], skippedScripts: [] }; },
    async emit(_a, o) {
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null };
    },
    async typeCheck() { return { errors: [] } as never; },
  });
  const run = async (bytes: Uint8Array) => {
    await writeFile(join(tmp, 'a.swf'), bytes);
    const a: PipelineArgs = {
      swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
      templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp,
    };
    await runPipeline(a, stages(), { out: () => undefined, err: () => undefined });
    return JSON.parse(await readFile(join(tmp, 'out', 'outcome.json'), 'utf8'));
  };
  it('a wrapper ends converted-with-gaps with the gap, the field and the sentence', async () => {
    const inner = embeddedSwfBytes('CWS');
    const o = await run(buildSwf({ tags: [binaryDataTag(46, inner)] }));
    expect(o.outcome).toBe('converted-with-gaps');
    expect(o.gaps).toEqual([{ kind: 'embedded-swf', count: 1, examples: [`id 46: CWS v10, ${inner.length} bytes`] }]);
    expect(o.embeddedSwfs).toEqual({ count: 1, totalBytes: inner.length, largestBytes: inner.length });
    expect(o.reason).toMatch(/^the file is a wrapper around another SWF that was not converted \(1 embedded, 0\.0 MiB\); /);
  });
  it('a ZWS wrapper is a gap too; a payload without a signature is not', async () => {
    const z = await run(buildSwf({ tags: [binaryDataTag(7, embeddedSwfBytes('ZWS'))] }));
    expect(z.outcome).toBe('converted-with-gaps');
    expect(z.gaps[0].kind).toBe('embedded-swf');
    await rm(join(tmp, 'out'), { recursive: true, force: true });
    const p = await run(buildSwf({ tags: [binaryDataTag(8, [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0])] }));
    expect(p.outcome).toBe('converted');
    expect(p.gaps).toEqual([]);
  });

  it('a binary-data tag nested in a sprite ends converted, without the gap', async () => {
    const sprite = tag(TAG.DefineSprite, [1, 0, 1, 0, ...binaryDataTag(9, embeddedSwfBytes('FWS')), ...tag(TAG.End)], true);
    const o = await run(buildSwf({ tags: [sprite] }));
    expect(o.outcome).toBe('converted');
    expect(o.gaps).toEqual([]);
    expect('embeddedSwfs' in o).toBe(false);
  });
  it('a file without an embedded SWF is unchanged', async () => {
    const o = await run(buildSwf());
    expect(o.outcome).toBe('converted');
    expect(o.gaps).toEqual([]);
    expect('embeddedSwfs' in o).toBe(false);
  });
});
