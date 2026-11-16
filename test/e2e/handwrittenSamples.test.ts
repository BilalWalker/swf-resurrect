// Requirement 33.7: over the committed samples' shared runs, every hand-written class a report lists is in the
// Handwritten_Set, and no run has the problem `handwritten-not-in-set`. Skipped with a reason when Java,
// tools/ffdec or Chromium is missing.
// Validates: Requirements 33.5, 33.7
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { readHandwrittenSet } from '../../src/pipeline/handwrittenSet';
import { sharedPipelineRun } from '../support/sharedPipelineRun';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ffdecJar = resolve(repoRoot, 'tools/ffdec/ffdec-cli.jar');
const SAMPLES = ['clickgoto', 'tweendemo', 'radial', 'gradients', 'acid-color-2', 'mask_reapply', 'click_block', '3_joystick', 'slider_component', 'entity_game'];
const TIMEOUT_MS = 10 * 60 * 1000;

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

describe.skipIf(reason !== null)(`hand-written classes of the committed samples are in the set${reason === null ? '' : ` (skipped: ${reason})`}`, () => {
  for (const sample of SAMPLES) {
    it(
      sample,
      async () => {
        const set = await readHandwrittenSet(join(repoRoot, 'handwritten'));
        const members = new Set(set.filter((e) => e.sample === sample).map((e) => e.className));
        const { outDir, code } = await sharedPipelineRun(sample, resolve(repoRoot, 'samples', sample, 'test.swf'));
        expect(code).toBe(0);
        const fidelity = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as { handwritten: Array<{ className: string }> };
        const translation = JSON.parse(await readFile(join(outDir, 'translation-report.json'), 'utf8')) as {
          handwritten?: Array<{ className: string }>;
          problems?: Array<{ kind: string }>;
        };
        for (const h of fidelity.handwritten) expect(members.has(h.className), `${sample}: ${h.className}`).toBe(true);
        for (const h of translation.handwritten ?? []) expect(members.has(h.className), `${sample}: ${h.className}`).toBe(true);
        expect((translation.problems ?? []).filter((p) => p.kind === 'handwritten-not-in-set')).toEqual([]);
      },
      TIMEOUT_MS,
    );
  }
});
