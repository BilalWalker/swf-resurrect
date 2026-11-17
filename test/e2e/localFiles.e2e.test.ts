// Local, uncommitted files under .work/judge-test/ run through the real CLI (robustness task 12.3).
// Output goes under .work/robustness-local/<name>/. Every case skips with a message when its file is absent.
// The results are written to .work/robustness-local/summary.md (never committed).
// Validates: Requirements 5.11, 6.16, 8.6
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parseOutcome } from '../../src/outcome/outcomeFile';
import { PIPELINE_SLOTS, withSlot } from '../support/slots';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const inDir = resolve(repoRoot, '.work', 'judge-test');
const outRoot = resolve(repoRoot, '.work', 'robustness-local');
/** Same bound as spacerLoad.e2e.test.ts, the longest explicit e2e timeout. Default limits are not changed. */
const LONG_TIMEOUT_MS = 15 * 60 * 1000;

function runCli(swf: string, outDir: string): Promise<{ code: number; output: string }> {
  return new Promise((res, rej) => {
    const tsx = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');
    const child = spawn(process.execPath, [tsx, 'src/pipeline/cli.ts', swf, outDir, '--force'], { cwd: repoRoot, windowsHide: true });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    child.on('error', rej);
    child.on('close', (code) => res({ code: code ?? 1, output }));
  });
}

const rows: string[] = [];
const notes: string[] = [];

const CASES: Array<{ name: string; file: string; outcome?: string; reason?: string; exit?: number }> = [
  { name: 'empty', file: 'empty.swf', outcome: 'refused', reason: 'not-swf', exit: 3 },
  { name: 'text', file: 'text.swf', outcome: 'refused', reason: 'not-swf', exit: 3 },
  { name: 'truncated', file: 'truncated.swf', outcome: 'refused', reason: 'damaged', exit: 3 },
  { name: 'redball4', file: 'redball4.swf' },
];

describe('local files', () => {
  afterAll(async () => {
    await mkdir(outRoot, { recursive: true });
    const md = [
      '# Local-file results (robustness task 12.3)', '',
      '| File | Outcome | Reason code | Exit code |', '|---|---|---|---|', ...rows, '', ...notes, '',
    ].join('\n');
    await writeFile(join(outRoot, 'summary.md'), md);
  });

  it.each(CASES)(
    '$file',
    async (c) => {
      const swf = join(inDir, c.file);
      if (!existsSync(swf)) {
        console.log(`SKIP ${c.file}: not present under .work/judge-test/`);
        rows.push(`| ${c.file} | skipped (file absent) | | |`);
        return;
      }
      const outDir = join(outRoot, c.name);
      await mkdir(outRoot, { recursive: true });
      const { code, output } = await withSlot('pipeline', PIPELINE_SLOTS, () => runCli(swf, outDir));
      const rec = parseOutcome(await readFile(join(outDir, 'outcome.json'), 'utf8'));
      rows.push(`| ${c.file} | ${rec.outcome} | ${rec.reasonCode ?? '-'} | ${code} |`);
      console.log(`${c.file}: outcome=${rec.outcome} reason=${rec.reasonCode ?? '-'} exit=${code}`);
      if (c.name === 'redball4') {
        const n = rec.numbers;
        const durations = rec.stages.map((s) => `${s.name}=${s.result}:${s.durationMs}ms`).join(', ');
        const line = n
          ? `redball4.swf numbers: candidates=${n.candidateClasses} translated=${n.translatedClasses} typeErrors=${n.typeErrors} gaps=${rec.gaps.map((g) => `${g.kind}:${g.count}`).join(',') || 'none'}`
          : 'redball4.swf numbers: none (no numbers recorded)';
        console.log(line);
        console.log(`redball4.swf stage durations (default limits): ${durations}`);
        notes.push(`## redball4.swf`, '', line, '', `Stage durations, default limits (first reading of Requirement 6.16): ${durations}`);
        expect(output.length).toBeGreaterThan(0);
        return;
      }
      expect(rec.outcome).toBe(c.outcome);
      expect(rec.reasonCode).toBe(c.reason);
      expect(code).toBe(c.exit);
    },
    LONG_TIMEOUT_MS,
  );
});
