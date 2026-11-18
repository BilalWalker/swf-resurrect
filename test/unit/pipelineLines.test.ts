import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { gateError } from '../support/gateError';
import { buildSwf } from '../support/hostileSwf';

let tmp: string;
let out: string;
let err: string;
const io = { out: (s: string) => void (out += s), err: (s: string) => void (err += s) };

function stages(errors: ReturnType<typeof gateError>[] = []): PipelineStages {
  return {
    async unpack() {
      return {} as never;
    },
    async convert() {
      return {
        stagingDir: '',
        scenePath: '',
        shapePaths: [],
        imagePaths: [],
        scene: {
          formatVersion: 2,
          stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 24 },
          rootSymbolId: 0,
          symbols: { '0': { type: 'sprite', className: 'MainTimeline', frameCount: 1, frames: [[]] } },
        },
        unsupported: [],
        stats: { svgWritten: 2, morphSkipped: 0, declaredShapes: 2 },
      } as never;
    },
    async translate() {
      return { classes: [], skippedScripts: [] };
    },
    async emit(_a, o) {
      await mkdir(o.outputDir, { recursive: true });
      return { outputDir: o.outputDir, files: [], omissions: [], loose: [], classPaths: [], gate: null };
    },
    async typeCheck() {
      return { errors } as never;
    },
  };
}

function args(): PipelineArgs {
  return {
    swfPath: join(tmp, 'a.swf'),
    outputDir: join(tmp, 'out'),
    force: false,
    keepWork: false,
    ffdecJarPath: 'jar',
    templateDir: 't',
    handwrittenDir: null,
    handwrittenClasses: [],
    cwd: tmp,
    homeDir: tmp,
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'pipe-lines-'));
  await writeFile(join(tmp, 'a.swf'), buildSwf());
  out = '';
  err = '';
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('pipeline console lines (S3)', () => {
  it('keeps the translate bracket text and labels the counts on the next line', async () => {
    await runPipeline(args(), stages(), io);
    const lines = out.split('\n');
    const i = lines.indexOf('[translate] ok (0 classes: 0 clean, 0 loose, 0 unsupported)');
    expect(i).toBeGreaterThan(-1);
    expect(lines[i + 1]).toBe('  counts taken before the type check; final counts are in translation-report.json');
  });

  it('leaves the unpack and typecheck ok lines unchanged', async () => {
    await runPipeline(args(), stages(), io);
    const lines = out.split('\n');
    expect(lines[0]).toBe('[unpack] ok');
    expect(lines).toContain('[typecheck] ok (0 errors)');
  });

  it('leaves the typecheck error line unchanged', async () => {
    await runPipeline(args(), stages([gateError()]), io);
    expect(err).toMatch(/^\[typecheck\] 1 errors: src\/A\.ts \(1\)\n/);
  });
});
