// Every committed sample ends converted or converted-with-gaps and writes an outcome.json that parseOutcome accepts
// (robustness task 12.3). The runs are the Shared_Run_Cache runs the other e2e files use.
// Validates: Requirements 4.10
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseOutcome } from '../../src/outcome/outcomeFile';
import { sharedPipelineRun } from '../support/sharedPipelineRun';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SAMPLES = [
  'clickgoto', 'tweendemo', 'radial', 'gradients', 'acid-color-2',
  'mask_reapply', 'click_block', '3_joystick', 'slider_component', 'entity_game',
] as const;

describe('committed sample Outcomes', () => {
  it.each(SAMPLES)(
    '%s ends converted or converted-with-gaps with a parseable outcome.json',
    async (sample) => {
      const { outDir, code } = await sharedPipelineRun(sample, resolve(repoRoot, 'samples', sample, 'test.swf'));
      const record = parseOutcome(await readFile(join(outDir, 'outcome.json'), 'utf8'));
      expect(['converted', 'converted-with-gaps']).toContain(record.outcome);
      expect(record.reasonCode).toBeNull();
      expect(code).toBe(0);
    },
    10 * 60 * 1000,
  );
});
