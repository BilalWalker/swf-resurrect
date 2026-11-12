// Floor test for the pipeline-level visual match (verify task 17.3), through the real verify path:
// FFDec unpack, emit, Vite build, headless Chromium render, comparison with the FFDec reference frames.
// Skipped with a reason when Java, tools/ffdec or Chromium is missing.
// Validates: Requirements 4.1, 13.5
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../../src/pipeline/cli';

/** Measured in task 17.3 (3 frames, 0 differing pixels each). Never lower. */
const OVERALL_MATCH_FLOOR_CLICKGOTO = 100;
/** Measured in task 17.3 (8 frames, 0 differing pixels each). Never lower. */
const OVERALL_MATCH_FLOOR_TWEENDEMO = 100;

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

interface VisualReport {
  visual: {
    status: string;
    overallMatch: number;
    frames: Array<{ frame: number; status: string; matchPercent?: number }>;
  };
}

describe.skipIf(reason !== null)(`overall visual match floor${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  let tempRoot = '';
  afterAll(async () => {
    if (tempRoot !== '') await rm(tempRoot, { recursive: true, force: true });
  }, 60_000);

  const cases: Array<[string, number]> = [
    ['clickgoto', OVERALL_MATCH_FLOOR_CLICKGOTO],
    ['tweendemo', OVERALL_MATCH_FLOOR_TWEENDEMO],
  ];
  it.each(cases)(
    '%s keeps Overall_Match at or above its floor',
    async (sample, floor) => {
      await mkdir(resolve(repoRoot, '.work'), { recursive: true });
      tempRoot = tempRoot === '' ? await mkdtemp(resolve(repoRoot, '.work', 'overall-match-')) : tempRoot;
      const outDir = join(tempRoot, sample);
      const code = await main([resolve(repoRoot, 'samples', sample, 'test.swf'), outDir, '--verify', '--force']);
      expect(code).toBe(0);
      const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as VisualReport;
      expect(report.visual.status).toBe('compared');
      expect(report.visual.frames.every((f) => f.status === 'compared')).toBe(true);
      expect(report.visual.overallMatch).toBeGreaterThanOrEqual(floor);
    },
    TIMEOUT_MS,
  );
});
