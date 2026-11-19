// `npm run web:prewarm [-- --rerun]`: converts every bundled sample through the same job code path
// as the web server (JobManager.submitSample) and leaves the results in .work/web-runs, so a fresh
// deployment shows every tombstone as "risen before" and opens it at once. Exits 1 when any sample
// does not end in a successful job, 2 on bad arguments or environment.
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JobSummary } from '../shared/api';
import { JobManager } from './jobs';
import { buildPreview, REPO_ROOT } from './main';
import { parseServerOptions } from './options';

export interface PrewarmResult {
  sample: string;
  id: string | null;
  /** True when an earlier successful result was reused. */
  cached: boolean;
  status: JobSummary['status'] | 'refused';
  /** Why it failed, in one line; null on success. */
  problem: string | null;
}

/** Converts each sample in turn (or reuses its cached result). Never throws for a failed sample. */
export async function prewarm(jobs: JobManager, o: { rerun: boolean; write(line: string): void }): Promise<PrewarmResult[]> {
  const results: PrewarmResult[] = [];
  for (const sample of await jobs.samples()) {
    let created;
    try {
      created = await jobs.submitSample(sample, o.rerun);
    } catch (err) {
      const problem = err instanceof Error ? err.message : String(err);
      o.write(`[${sample}] refused: ${problem}`);
      results.push({ sample, id: null, cached: false, status: 'refused', problem });
      continue;
    }
    const job = jobs.get(created.id);
    if (job === undefined) throw new Error(`job ${created.id} vanished`);
    if (created.cached) {
      o.write(`[${sample}] cached result ${created.id}`);
    } else {
      o.write(`[${sample}] converting as job ${created.id}`);
      const unsubscribe = jobs.subscribe(job, (event, data) => {
        if (event === 'log' && 'text' in data) o.write(`[${sample}] ${data.text}`);
      });
      await jobs.whenSettled(created.id);
      unsubscribe();
    }
    const summary = jobs.summary(job);
    const problem =
      summary.status === 'succeeded'
        ? null
        : summary.error !== null
          ? `${summary.error.stage}: ${summary.error.message}`
          : summary.outcome !== null
            ? `${summary.outcome.reasonCode ?? summary.outcome.outcome}: ${summary.outcome.reason}`
            : `ended as ${summary.status}`;
    o.write(`[${sample}] ${summary.status}${problem === null ? '' : ` (${problem})`}`);
    results.push({ sample, id: created.id, cached: created.cached, status: summary.status, problem });
  }
  return results;
}

/** Exit code and closing lines for a pre-warm run. Pure. */
export function prewarmVerdict(results: readonly PrewarmResult[]): { code: 0 | 1; lines: string[] } {
  if (results.length === 0) return { code: 1, lines: ['prewarm FAILED: no samples found (samples/<name>/test.swf)'] };
  const failed = results.filter((r) => r.status !== 'succeeded');
  if (failed.length === 0) {
    return { code: 0, lines: [`prewarm ok: ${results.length} sample(s) ready (${results.filter((r) => r.cached).length} already cached)`] };
  }
  return {
    code: 1,
    lines: [`prewarm FAILED: ${failed.length} of ${results.length} sample(s) did not convert`, ...failed.map((r) => `  ${r.sample}: ${r.problem ?? r.status}`)],
  };
}

const invokedAsScript = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  const args = process.argv.slice(2);
  const bad = args.filter((a) => a !== '--rerun');
  if (bad.length > 0) {
    process.stderr.write(`Unknown argument: ${bad[0]}\nUsage: npm run web:prewarm [-- --rerun]\n`);
    process.exit(2);
  }
  // Same environment as the server (FFDec jar, timeout); no port is opened.
  const parsed = parseServerOptions([], process.env, REPO_ROOT);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    process.exit(2);
  }
  const jobs = new JobManager({
    repoRoot: REPO_ROOT,
    runsDir: join(REPO_ROOT, '.work', 'web-runs'),
    ffdecJar: parsed.options.ffdecJar,
    timeoutMs: parsed.options.timeoutMs,
    buildPreview,
  });
  const write = (line: string): void => void process.stdout.write(`${line}\n`);
  const run = async (): Promise<number> => {
    await jobs.load();
    const setup = jobs.setupStatus();
    if (!setup.ready) {
      for (const p of setup.problems) process.stderr.write(`setup: ${p}\n`);
      process.stderr.write('prewarm FAILED: conversions cannot run here\n');
      return 1;
    }
    const verdict = prewarmVerdict(await prewarm(jobs, { rerun: args.includes('--rerun'), write }));
    for (const l of verdict.lines) (verdict.code === 0 ? process.stdout : process.stderr).write(`${l}\n`);
    return verdict.code;
  };
  run().then(
    async (code) => {
      await jobs.stop();
      process.exit(code);
    },
    async (err: unknown) => {
      process.stderr.write(`prewarm FAILED: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
      await jobs.stop();
      process.exit(1);
    },
  );
}
