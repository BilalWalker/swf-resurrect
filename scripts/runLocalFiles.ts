// `npm run test:local-files`: runs test/e2e/localFiles.e2e.test.ts, which the default suite skips.
// It sets SWF_RESURRECT_LOCAL_FILES=1 (portable, no cross-env) and runs vitest on that one file.
// The files are read from .work/judge-test/ and the results go to .work/robustness-local/summary.md.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestBin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const r = spawnSync(process.execPath, [vitestBin, '--run', 'test/e2e/localFiles.e2e.test.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, SWF_RESURRECT_LOCAL_FILES: '1' },
});
process.exit(r.status ?? 1);
