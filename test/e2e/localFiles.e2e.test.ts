// Local, uncommitted files under .work/judge-test/ run through the real CLI (robustness task 12.3).
// ON REQUEST ONLY: the default suite skips this file without reading .work/judge-test/. Run it with
//   npm run test:local-files        (or set SWF_RESURRECT_LOCAL_FILES=1 and run vitest on this file)
// redball4.swf alone takes about 90 s of heavy CPU, which made the default suite unstable.
// Every file found gets the same report; the table below only holds expectations as data.
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

/** The default suite never reads .work/judge-test/: without the variable the whole block is skipped. */
const requested = process.env.SWF_RESURRECT_LOCAL_FILES === '1';

describe.skipIf(!requested)('local files', () => {
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
      const n = rec.numbers;
      const durations = rec.stages.map((s) => `${s.name}=${s.result}:${s.durationMs}ms`).join(', ') || 'none';
      const gaps = rec.gaps.map((g) => `${g.kind}:${g.count}`).join(',') || 'none';
      const line = n
        ? `${c.file} numbers: candidates=${n.candidateClasses} translated=${n.translatedClasses} untranslated-code=${n.untranslatedCodeClasses} unparsed=${n.unparsedClasses} typeErrors=${n.typeErrors} gaps=${gaps}`
        : `${c.file} numbers: none (no numbers recorded) gaps=${gaps}`;
      console.log(line);
      console.log(`${c.file} stage durations (default limits): ${durations}`);
      notes.push(`## ${c.file}`, '', line, '', `Stage durations, default limits: ${durations}`, '');
      // Expectations are data in the case table; a case without them is recorded only.
      if (c.outcome !== undefined) {
        expect(rec.outcome).toBe(c.outcome);
        expect(rec.reasonCode).toBe(c.reason);
        expect(code).toBe(c.exit);
      } else {
        expect(output.length).toBeGreaterThan(0);
      }
    },
    LONG_TIMEOUT_MS,
  );
});
