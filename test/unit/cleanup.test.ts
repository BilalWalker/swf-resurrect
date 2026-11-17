import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planCleanup } from '../../src/pipeline/cleanup';
import { runPipeline } from '../../src/pipeline/pipeline';
import type { PipelineArgs, PipelineStages } from '../../src/pipeline/pipeline';
import { buildSwf } from '../support/hostileSwf';

describe('planCleanup', () => {
  it('returns written minus pre-existing and keeps protected files', () => {
    const plan = planCleanup({
      preExisting: ['foreign.txt', 'src', 'src/mine.ts'],
      writtenByRun: [
        'src/mine.ts', 'src/a.ts', 'index.html', 'outcome.json', 'unsupported-features.json',
        'translation-report.json', 'fidelity-report.json', 'failure-0123abcd.log', 'ffdec-0123abcd.log', 'extra.txt',
      ],
      keep: ['extra.txt'],
    });
    expect(plan.files).toEqual(['index.html', 'src/a.ts']);
    expect(plan.directories).toEqual([]);
  });

  it('lists directories the run created, deepest first, and not the pre-existing ones', () => {
    const plan = planCleanup({ preExisting: ['src'], writtenByRun: ['src/a/b/c.ts', 'assets/x.json'], keep: [] });
    expect(plan.directories).toEqual(['src/a/b', 'src/a', 'assets']);
  });
});

let tmp: string;
const io = { out: () => undefined, err: () => undefined };

function args(extra: Partial<PipelineArgs> = {}): PipelineArgs {
  return {
    swfPath: join(tmp, 'a.swf'), outputDir: join(tmp, 'out'), force: false, keepWork: false, ffdecJarPath: 'jar',
    templateDir: 't', handwrittenDir: null, handwrittenClasses: [], cwd: tmp, homeDir: tmp, ...extra,
  };
}

/** Emit writes three files (journaled before each write) and throws on the third. */
function stages(seenWorkDir: { dir: string }): PipelineStages {
  return {
    async unpack(i) {
      seenWorkDir.dir = i.workDir;
      return {} as never;
    },
    async convert() {
      return { unsupported: [], stats: { svgWritten: 0, morphSkipped: 0, placementsDropped: 0 }, scene: { symbols: {} } } as never;
    },
    async translate() {
      return { classes: [], skippedScripts: [] };
    },
    async emit(_a, o) {
      await mkdir(join(o.outputDir, 'src'), { recursive: true });
      for (const p of ['index.html', 'src/a.ts', 'src/b.ts']) {
        o.onWrite?.(p);
        if (p === 'src/b.ts') throw new Error('disk full');
        await writeFile(join(o.outputDir, ...p.split('/')), 'x');
      }
      throw new Error('unreachable');
    },
    async typeCheck() {
      return { errors: [] } as never;
    },
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'cleanup-'));
  await writeFile(join(tmp, 'a.swf'), buildSwf());
  await mkdir(join(tmp, 'out'));
  await writeFile(join(tmp, 'out', 'foreign.txt'), 'mine');
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('cleanup after a failed run', () => {
  it('removes what Emit wrote before it threw, keeps the foreign file, the Outcome_File, reports and logs, and removes the work directory', async () => {
    const seen = { dir: '' };
    const exit = await runPipeline(args({ force: true }), stages(seen), io);
    expect(exit).toBe(1);
    const names = (await readdir(join(tmp, 'out'), { recursive: true })).map((n) => n.split('\\').join('/')).sort();
    expect(names).toContain('foreign.txt');
    expect(names).toContain('outcome.json');
    expect(names.some((n) => /^failure-[0-9a-f]{8}\.log$/.test(n))).toBe(true);
    expect(names).not.toContain('index.html');
    expect(names).not.toContain('src/a.ts');
    expect(names).not.toContain('src');
    await expect(stat(seen.dir)).rejects.toThrow();
  });

  it('keeps the work directory with keepWork', async () => {
    const seen = { dir: '' };
    await runPipeline(args({ keepWork: true }), stages(seen), io);
    expect((await stat(seen.dir)).isDirectory()).toBe(true);
    await rm(seen.dir, { recursive: true, force: true });
  });
});
