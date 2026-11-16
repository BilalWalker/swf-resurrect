// Floor test for the pipeline-level Trace_Score (breadth task 16.3), through the real verify path:
// FFDec unpack, emit, Vite build, headless Chromium render, Replay of the reference input.
// Skipped with a reason when Java, tools/ffdec or Chromium is missing.
// Validates: Requirements 3.6, 3.7, 18.13
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { sharedPipelineRun } from '../support/sharedPipelineRun';

/** Measured in task 16.2 (missing 0, extra 0; was 0 at Checkpoint 27). Never lower. */
const TRACE_SCORE_FLOOR_MASK_REAPPLY = 100;
/** Measured in task 16.5 (5 of 5 matched, missing 0, extra 0; was 100 at Checkpoint 27). Never lower. */
const TRACE_SCORE_FLOOR_CLICK_BLOCK = 100;
/** Measured in task 17.2 (3 of 4 lines matched, missing 1, extra 0; was 75 at Checkpoint 27). The missing line is `wrap`: the AS3 `with(joystick)` in enterFrameHandler is not translated, so its body is comments and the trace call never runs. Never lower. */
const TRACE_SCORE_FLOOR_3_JOYSTICK = 75;
/** Measured in task 17.5 (1 of 4 lines matched, missing 3, extra 0; was 25 at Checkpoint 27). The three missing lines are the changeHandler traces: fl.controls.Slider extends UIComponent, which fails at load with TS2304 on TextFormat (line 15), so Slider is omitted, symbol 20 is a plain MovieClip and never dispatches CHANGE. Never lower. */
const TRACE_SCORE_FLOOR_SLIDER_COMPONENT = 25;
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
  behaviour: { status: string; traceScore?: number };
}

describe.skipIf(reason !== null)(`trace score floor${reason === null ? '' : ` (skipped: ${reason})`}`, () => {

  const cases: Array<[string, number]> = [
    ['mask_reapply', TRACE_SCORE_FLOOR_MASK_REAPPLY],
    ['click_block', TRACE_SCORE_FLOOR_CLICK_BLOCK],
    ['3_joystick', TRACE_SCORE_FLOOR_3_JOYSTICK],
    ['slider_component', TRACE_SCORE_FLOOR_SLIDER_COMPONENT],
  ];
  it.each(cases)(
    '%s keeps Trace_Score at or above its floor',
    async (sample, floor) => {
      const { outDir, code } = await sharedPipelineRun(sample, resolve(repoRoot, 'samples', sample, 'test.swf'));
      expect(code).toBe(0);
      const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as BehaviourReport;
      expect(report.behaviour.status).toBe('compared');
      expect(report.behaviour.traceScore).toBeGreaterThanOrEqual(floor);
    },
    TIMEOUT_MS,
  );
});
