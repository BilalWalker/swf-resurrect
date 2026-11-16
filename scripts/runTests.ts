// `npm test`: the main vitest run, then launchChromium.e2e alone (task 29.1).
//
// That file asserts that a Chromium process is gone within 20 s, which is flaky while 15 other files keep the machine
// busy, so it runs in a second vitest invocation after the first has ended. Every argument after `npm test --` goes to
// both invocations (`--run`, file filters, reporters), so `npm test -- --run` is two single runs, one after the other.
// vitest.config.ts picks the file set from SWF_TEST_PHASE: `main` leaves the file out, `isolated` runs only it.
// A filter that matches nothing in one phase is not an error there (--passWithNoTests). A reporter output file
// (`--outputFile=<path>` or `--outputFile.<reporter>=<path>`) of the second phase gets `.isolated` before its extension,
// so it does not overwrite the first phase's file.
// In watch mode (no --run, interactive terminal, not CI) there is one invocation with every file, as plain vitest has.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestBin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const args = process.argv.slice(2);
const runMode = args.some((a) => a === '--run' || a === 'run' || a === '--watch=false') || !process.stdin.isTTY || Boolean(process.env.CI);

function isolatedOutput(arg: string): string {
  const m = /^(--outputFile(?:\.\w+)?=)(.*?)(\.[^./\\]*)?$/.exec(arg);
  return m === null ? arg : `${m[1]}${m[2]}.isolated${m[3] ?? ''}`;
}

function vitest(phase: string | undefined, extra: string[]): number {
  const env = { ...process.env };
  if (phase === undefined) delete env.SWF_TEST_PHASE;
  else env.SWF_TEST_PHASE = phase;
  const r = spawnSync(process.execPath, [vitestBin, ...(phase === 'isolated' ? args.map(isolatedOutput) : args), ...extra], { stdio: 'inherit', env });
  return r.status ?? 1;
}

if (!runMode) {
  process.exit(vitest(undefined, []));
}
const withNoFilesOk = ['--passWithNoTests', ...(args.some((a) => a === '--run') ? [] : ['--run'])];
const main = vitest('main', withNoFilesOk);
const isolated = vitest('isolated', withNoFilesOk);
process.exit(main !== 0 ? main : isolated);