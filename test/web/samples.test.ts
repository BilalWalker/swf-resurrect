// The gallery lists committed samples and fetched ones (.work/samples/<name>/test.swf, for a sample
// whose licence keeps it out of the repository), with a short author credit.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JobManager } from '../../web/server/jobs';
import { pipelineArgs } from '../../web/server/processTree';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'web-samples-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const prov = (author: string, licence: string): string =>
  `# Provenance\n| Field | Value |\n|---|---|\n| Author | ${author} |\n| Licence | ${licence} |\n`;

describe('sample gallery', () => {
  it('lists committed and fetched samples with name-only credits', async () => {
    await mkdir(join(root, 'samples', 'kept'), { recursive: true });
    await writeFile(join(root, 'samples', 'kept', 'test.swf'), 'FWS-kept');
    await writeFile(join(root, 'samples', 'kept', 'PROVENANCE.md'), prov('Iain Lobb', 'MIT'));
    await mkdir(join(root, 'samples', 'fetched', 'reference'), { recursive: true });
    await writeFile(join(root, 'samples', 'fetched', 'PROVENANCE.md'), prov('Zabuzard (GitHub user; repository `Zabuzard/Spacer`)', 'GPL-3.0'));
    await mkdir(join(root, 'samples', 'missing'), { recursive: true });
    await mkdir(join(root, '.work', 'samples', 'fetched'), { recursive: true });
    await writeFile(join(root, '.work', 'samples', 'fetched', 'test.swf'), 'FWS-fetched');
    const jobs = new JobManager({ repoRoot: root, runsDir: join(root, 'runs'), ffdecJar: 'x', timeoutMs: 1000, buildPreview: () => Promise.resolve() });
    const list = await jobs.listSamples();
    expect(list.map((s) => [s.name, s.author, s.licence])).toEqual([
      ['fetched', 'Zabuzard', 'GPL-3.0'],
      ['kept', 'Iain Lobb', 'MIT'],
    ]);
  });

  it('names the reference folder only when asked', () => {
    const base = { repoRoot: 'r', swfPath: 's.swf', outDir: 'o', workDir: 'w', ffdecJar: 'f', runLimitS: 300 };
    expect(pipelineArgs(base)).not.toContain('--reference-dir');
    const args = pipelineArgs({ ...base, referenceDir: 'samples/spacer/reference' });
    expect(args.slice(-2)).toEqual(['--reference-dir', 'samples/spacer/reference']);
  });
});
