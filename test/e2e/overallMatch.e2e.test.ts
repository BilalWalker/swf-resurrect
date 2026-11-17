// Floor test for the pipeline-level visual match (verify task 17.3), through the real verify path:
// FFDec unpack, emit, Vite build, headless Chromium render, comparison with the FFDec reference frames.
// Skipped with a reason when Java, tools/ffdec or Chromium is missing.
// Validates: Requirements 4.1, 13.5
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { describeIfSpacer, spacerSwfPath } from '../support/fetchedSpacer';
import { sharedPipelineRun } from '../support/sharedPipelineRun';

/** Measured in task 17.3 (3 frames, 0 differing pixels each). Never lower. */
const OVERALL_MATCH_FLOOR_CLICKGOTO = 100;
/** Measured in task 17.3 (8 frames, 0 differing pixels each). Never lower. */
const OVERALL_MATCH_FLOOR_TWEENDEMO = 100;

/** Measured in task 15.2 (1 frame, 0 differing pixels). Never lower. */
const OVERALL_MATCH_FLOOR_RADIAL = 100;
/** Measured in task 15.2 (1 frame, 1302 differing pixels, all attributed in residual-causes.json). Never lower. */
const OVERALL_MATCH_FLOOR_GRADIENTS = 99.41;
/** Measured in task 15.5 (1 frame, 0 of 220000 differing pixels; Exact_Render, Requirement 13.6). Never lower. */
const OVERALL_MATCH_FLOOR_ACID_COLOR_2 = 100;
/** Measured in task 16.2 (1 frame, 2 differing pixels, attributed in residual-causes.json; was 20.00 with the mask off). Never lower. */
const OVERALL_MATCH_FLOOR_MASK_REAPPLY = 99.99;
/** Measured in task 16.5 (8 frames, all 39 differing regions attributed in residual-causes.json; was 90.85 at Checkpoint 27). Never lower. */
const OVERALL_MATCH_FLOOR_CLICK_BLOCK = 95.75;
/** Measured in task 17.2 (21 ticks, all 59 differing regions attributed in residual-causes.json; was 15.82 at Checkpoint 27). Never lower. */
const OVERALL_MATCH_FLOOR_3_JOYSTICK = 98.86;
/** Measured in task 17.5 (10 ticks, all 6 differing regions attributed to stroke scaling; was 99.93 at Checkpoint 27). Never lower. */
const OVERALL_MATCH_FLOOR_SLIDER_COMPONENT = 99.93;
/**
 * Measured in task 21.1 (1 frame, 0 differing pixels). The SWF has one root frame and the game draws by code, so the FFDec reference
 * frame is blank and this 100 cannot see code-drawn shapes: the report names that as known limit code-drawn-shapes. Never lower.
 */
const OVERALL_MATCH_FLOOR_ENTITY_GAME = 100;
/**
 * Measured in task 29.3 on the fetched spacer SWF (root frames 1 and 2, the first frame of each scene; 560000 pixels each, 0 differing
 * pixels, so there is no region to attribute). The report still lists the text limits: no text is visible in these two frames. Never lower.
 */
const OVERALL_MATCH_FLOOR_SPACER = 100;
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
    frames: Array<{ frame: number; status: string; matchPercent?: number; differingPixels?: number }>;
  };
}

describe.skipIf(reason !== null)(`overall visual match floor${reason === null ? '' : ` (skipped: ${reason})`}`, () => {

  const cases: Array<[string, number]> = [
    ['clickgoto', OVERALL_MATCH_FLOOR_CLICKGOTO],
    ['tweendemo', OVERALL_MATCH_FLOOR_TWEENDEMO],
    ['radial', OVERALL_MATCH_FLOOR_RADIAL],
    ['gradients', OVERALL_MATCH_FLOOR_GRADIENTS],
    ['acid-color-2', OVERALL_MATCH_FLOOR_ACID_COLOR_2],
    ['mask_reapply', OVERALL_MATCH_FLOOR_MASK_REAPPLY],
    ['click_block', OVERALL_MATCH_FLOOR_CLICK_BLOCK],
    ['3_joystick', OVERALL_MATCH_FLOOR_3_JOYSTICK],
    ['slider_component', OVERALL_MATCH_FLOOR_SLIDER_COMPONENT],
    ['entity_game', OVERALL_MATCH_FLOOR_ENTITY_GAME],
  ];
  it.each(cases)(
    '%s keeps Overall_Match at or above its floor',
    async (sample, floor) => {
      const { outDir, code } = await sharedPipelineRun(sample, resolve(repoRoot, 'samples', sample, 'test.swf'));
      expect(code).toBe(0);
      const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as VisualReport;
      expect(report.visual.status).toBe('compared');
      expect(report.visual.frames.every((f) => f.status === 'compared')).toBe(true);
      expect(report.visual.overallMatch).toBeGreaterThanOrEqual(floor);
      if (sample === 'entity_game') {
        // One frame exists (frameCount 1), and the 100 does not cover code-drawn shapes: the report must say so.
        expect(report.visual.frames).toHaveLength(1);
        const limits = (report as unknown as { visual: { knownVisualLimits: Array<{ kind: string }> } }).visual.knownVisualLimits;
        expect(limits.map((l) => l.kind)).toContain('code-drawn-shapes');
      }
      if (sample === 'acid-color-2') {
        // Exact_Render: frame 1 has zero differing pixels under the unchanged Verify_Tolerance.
        const frame1 = report.visual.frames.find((f) => f.frame === 1);
        expect(frame1?.differingPixels).toBe(0);
      }
    },
    TIMEOUT_MS,
  );
});

// The spacer SWF is fetched (GPL-3.0, never committed): the suite is skipped with the fetch message when it is absent.
describeIfSpacer('spacer overall visual match floor', () => {
  if (reason !== null) {
    it.skip(`needs the verify toolchain (${reason})`, () => undefined);
    return;
  }
  it(
    'keeps Overall_Match at or above its floor on the first frame of each scene',
    async () => {
      const { outDir, code } = await sharedPipelineRun('spacer', spacerSwfPath());
      expect([0, 1]).toContain(code); // type errors are reported, not fatal
      const report = JSON.parse(await readFile(join(outDir, 'fidelity-report.json'), 'utf8')) as VisualReport;
      expect(report.visual.status).toBe('compared');
      expect(report.visual.frames.map((f) => [f.frame, f.status])).toEqual([[1, 'compared'], [2, 'compared']]);
      expect(report.visual.overallMatch).toBeGreaterThanOrEqual(OVERALL_MATCH_FLOOR_SPACER);
      // Block D draws the static edit texts: no entry may still say text is dropped (they stay as text-metrics only).
      const listed = JSON.parse(await readFile(join(outDir, 'unsupported-features.json'), 'utf8')) as { kind: string }[] | { entries: { kind: string }[] };
      const kinds = (Array.isArray(listed) ? listed : listed.entries).map((u) => u.kind);
      expect(kinds).not.toContain('text');
      expect(kinds.filter((k) => k === 'text-metrics')).toHaveLength(13);
    },
    TIMEOUT_MS,
  );
});
