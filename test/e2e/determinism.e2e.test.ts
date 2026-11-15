// Determinism test (breadth task 17.14), through the real verify path: two Pipeline runs on the same SWF into
// different directories give byte-identical `assets/*.shape.json`, `assets/images/*`, `assets/scene.json`,
// `fidelity-report.json` and `fidelity-report.html`.
// Skipped with a reason when Java, tools/ffdec or Chromium is missing.
// Validates: Requirements 1.3, 1.4, 15.5
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../../src/pipeline/cli';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ffdecJar = resolve(repoRoot, 'tools/ffdec/ffdec-cli.jar');

function skipReason(): string | null {
  const java = spawnSync('java', ['-version'], { windowsHide: true });
  if (java.error !== undefined || java.status !== 0) return 'Java is not available on PATH';
  if (!existsSync(ffdecJar)) return `FFDec jar not found at ${ffdecJar}`;
  let chromiumPath = '';
  try {
    chromiumPath = chromium.executablePath();
  } catch {
    /* fall through */
  }
  if (chromiumPath === '' || !existsSync(chromiumPath)) return 'Playwright Chromium is not installed';
  return null;
}

const reason = skipReason();
const TIMEOUT_MS = 10 * 60 * 1000;

/** Relative paths (forward slashes, sorted) of the files the test compares under an output directory. */
async function comparedFiles(outDir: string): Promise<string[]> {
  const files = ['fidelity-report.json', 'fidelity-report.html'];
  const assets = join(outDir, 'assets');
  const walk = async (dir: string, rel: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relPath = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === 'images') await walk(join(dir, entry.name), relPath);
      } else if (rel === 'assets/images' || entry.name === 'scene.json' || entry.name.endsWith('.shape.json')) {
        files.push(relPath);
      }
    }
  };
  await walk(assets, 'assets');
  return files.sort();
}

describe.skipIf(reason !== null)(`pipeline determinism${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  let tempRoot = '';
  afterAll(async () => {
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  it.each(['radial', 'mask_reapply'])(
    '%s: two runs give byte-identical assets and reports',
    async (sample) => {
      await mkdir(resolve(repoRoot, '.work'), { recursive: true });
      tempRoot = tempRoot === '' ? await mkdtemp(resolve(repoRoot, '.work', 'determinism-')) : tempRoot;
      const swf = resolve(repoRoot, 'samples', sample, 'test.swf');
      const outA = join(tempRoot, `${sample}-a`);
      const outB = join(tempRoot, `${sample}-b`);
      expect(await main([swf, outA, '--verify', '--force'])).toBe(0);
      expect(await main([swf, outB, '--verify', '--force'])).toBe(0);
      const filesA = await comparedFiles(outA);
      const filesB = await comparedFiles(outB);
      expect(filesB).toEqual(filesA);
      expect(filesA).toContain('assets/scene.json');
      expect(filesA).toContain('fidelity-report.json');
      expect(filesA).toContain('fidelity-report.html');
      for (const file of filesA) {
        const a = await readFile(join(outA, file));
        const b = await readFile(join(outB, file));
        expect(Buffer.compare(a, b), file).toBe(0);
      }
    },
    TIMEOUT_MS,
  );
});
