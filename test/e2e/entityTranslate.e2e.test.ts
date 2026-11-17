// The three Signal classes of entity_game translate and type-check from the decompiled source, with no Hand_Written_Class
// (as3-coverage task 19.1, Requirement 18.1). A sample run, so it names the sample.
// Validates: Requirements 18.1
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sharedPipelineRun } from '../support/sharedPipelineRun';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const NAMES = ['SignalBinding', 'SignalBindingList', 'Signal'].map((n) => `org.osflash.signals.${n}`);
describe('entity_game Signal classes', () => {
  it(
    'are translated, type-check clean and are not replaced',
    async () => {
      const { outDir, code } = await sharedPipelineRun('entity_game', resolve(repoRoot, 'samples/entity_game/test.swf'));
      expect(code).toBe(0);
      const report = JSON.parse(await readFile(join(outDir, 'translation-report.json'), 'utf8')) as {
        classes: Array<{ className: string; status: string; overridden: boolean; omitted: boolean; typeErrors: unknown[] }>;
      };
      for (const name of NAMES) {
        const c = report.classes.find((x) => x.className === name);
        expect(c, name).toBeDefined();
        expect(c!.typeErrors, name).toEqual([]);
        expect(c!.status, name).not.toBe('unsupported');
        expect(c!.overridden, name).toBe(false);
        expect(c!.omitted, name).toBe(false);
      }
      expect(report.classes.every((c) => c.status !== 'untranslated-class')).toBe(true);
    },
    10 * 60 * 1000,
  );
});
