// Residual floor (breadth task 13.3, Requirement 21.3, 21.7): a sample whose Overall_Match is below 100 may only
// have a floor committed when every differing region has a cause in samples/<name>/residual-causes.json.
// Runs the real verify path, so it is skipped with a reason when Java, tools/ffdec or Chromium is missing.
// Validates: Requirements 21.3, 21.7
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../../src/pipeline/cli';

/**
 * Admitted samples with an Overall_Match below 100. Empty until Task 15 admits the first one; add the sample
 * name here together with its residual-causes.json and its floor in the same commit.
 */
const ADMITTED_BELOW_100: readonly string[] = [];

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

interface ResidualReport {
  visual: { residual: { regions: number; attributed: number; unattributed: number } };
}

describe.skipIf(reason !== null)(`residual attribution floor${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  let tempRoot = '';
  afterAll(async () => {
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  // vitest fails a file with no test, so an empty list gets one passing placeholder that says why.
  if (ADMITTED_BELOW_100.length === 0) {
    it('has no admitted sample below 100 yet (Task 15 adds the first)', () => {
      expect(ADMITTED_BELOW_100).toEqual([]);
    });
  }

  it.each(ADMITTED_BELOW_100.map((s) => [s] as [string]))(
    '%s has no unattributed differing region',
    async (sample) => {
      await mkdir(resolve(repoRoot, '.work'), { recursive: true });
      tempRoot = tempRoot === '' ? await mkdtemp(resolve(repoRoot, '.work', 'residual-')) : tempRoot;
      const outDir = join(tempRoot, sample);
      const code = await main([resolve(repoRoot, 'samples', sample, 'test.swf'), outDir, '--verify', '--force']);
      expect(code).toBe(0);
      const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as ResidualReport;
      expect(report.visual.residual.unattributed).toBe(0);
    },
    TIMEOUT_MS,
  );
});
