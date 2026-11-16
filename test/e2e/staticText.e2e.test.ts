// Floor test for the Fetched_Sample `static_text` (breadth task 17.13), through the real verify path.
// The file is never committed (Requirement 20.1): the suite is skipped, naming `npm run fetch:static-text`,
// when `.work/samples/static_text/test.swf` is absent, and fails naming both SHA-256 values when it differs.
// Also skipped with a reason when Java, tools/ffdec or Chromium is missing.
// Validates: Requirements 3.6, 10.6, 20.3, 20.8, 20.9
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { assertNotFailed, STATIC_TEXT_PATH, staticTextDecision, suiteTitle } from '../support/fetchedSample';
import { sharedPipelineRun } from '../support/sharedPipelineRun';

/** Measured in task 17.12 (1 frame, 0 differing pixels). Never lower. */
const OVERALL_MATCH_FLOOR_STATIC_TEXT = 100;
/**
 * Measured in task 17.12 (0 of 3 lines matched, missing 3, extra 0). Never lower.
 * Cause: `Test`, the root-package class that the frame script calls as `new Test(this)`, is not translated,
 * so the frame script throws "Test is not defined" and the constructor that traces the lines never runs.
 * Requirement 20.8 accepts the three reference lines as missing; no line is removed from the comparison.
 */
const TRACE_SCORE_FLOOR_STATIC_TEXT = 0;
const EXPECTED_MISSING = [
  'Caught error: ArgumentError: Error #2012: StaticText$ class cannot be instantiated.',
  'e.errorID: 2012',
  'Child: [object StaticText]',
];

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

const decision = staticTextDecision();
const reason = skipReason();
const TIMEOUT_MS = 10 * 60 * 1000;

interface StaticTextReport {
  visual: { status: string; overallMatch: number; frames: Array<{ status: string; differingPixels?: number }> };
  behaviour: {
    status: string;
    traceScore?: number;
    matched?: number;
    missing?: Array<{ line: number; text: string }>;
    extra?: Array<{ line: number; text: string }>;
  };
}

describe('static_text is not committed', () => {
  it('samples/static_text/test.swf does not exist (Requirement 20.1)', () => {
    expect(existsSync(resolve(repoRoot, 'samples', 'static_text', 'test.swf'))).toBe(false);
  });
  it('a path that does not exist gives a skip decision naming the fetch command', () => {
    const d = staticTextDecision(resolve(repoRoot, '.work', 'samples', 'static_text', 'absent', 'test.swf'));
    if (d.action !== 'skip') throw new Error(`expected skip, got ${d.action}`);
    expect(d.message).toContain('npm run fetch:static-text');
  });
});

describe.skipIf(decision.action === 'skip' || reason !== null)(
  suiteTitle('static_text floors', decision) + (reason === null ? '' : ` (skipped: ${reason})`),
  () => {

    it(
      'keeps Overall_Match and Trace_Score at their floors; the three reference lines are the missing ones',
      async () => {
        assertNotFailed(decision);
        const referenceDir = resolve(repoRoot, 'samples', 'static_text', 'reference');
        const { outDir, code } = await sharedPipelineRun('static_text', STATIC_TEXT_PATH, {
          extraArgs: ['--reference-dir', referenceDir],
          inputDirs: [referenceDir],
        });
        expect(code).toBe(0);
        const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as StaticTextReport;
        expect(report.visual.status).toBe('compared');
        expect(report.visual.overallMatch).toBeGreaterThanOrEqual(OVERALL_MATCH_FLOOR_STATIC_TEXT);
        expect(report.behaviour.status).toBe('compared');
        expect(report.behaviour.traceScore).toBeGreaterThanOrEqual(TRACE_SCORE_FLOOR_STATIC_TEXT);
        expect((report.behaviour.missing ?? []).map((l) => l.text)).toEqual(EXPECTED_MISSING);
        expect(report.behaviour.extra ?? []).toEqual([]);
      },
      TIMEOUT_MS,
    );
  },
);
