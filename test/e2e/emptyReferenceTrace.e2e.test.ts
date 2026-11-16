// Pins the report for samples whose reference output.txt is empty (Empty_Reference_Trace, task 15.3).
// This is not a floor: it asserts the status and reason, and that no Trace_Score field exists.
// Skipped with a reason when Java, tools/ffdec or Chromium is missing.
// Validates: Requirements 3.7, 14.24
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { sharedPipelineRun } from '../support/sharedPipelineRun';

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

interface BehaviourReport {
  behaviour: Record<string, unknown> & { status: string; reason?: string };
}

describe.skipIf(reason !== null)(`empty reference trace report${reason === null ? '' : ` (skipped: ${reason})`}`, () => {

  it.each(['radial', 'gradients', 'acid-color-2'])(
    '%s reports behaviour not-compared with empty-reference-trace and no Trace_Score',
    async (sample) => {
      const { outDir, code } = await sharedPipelineRun(sample, resolve(repoRoot, 'samples', sample, 'test.swf'));
      expect(code).toBe(0);
      const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as BehaviourReport;
      expect(report.behaviour.status).toBe('not-compared');
      expect(report.behaviour.reason).toBe('empty-reference-trace');
      expect(report.behaviour).not.toHaveProperty('traceScore');
      expect(report.behaviour).not.toHaveProperty('score');
    },
    TIMEOUT_MS,
  );
});