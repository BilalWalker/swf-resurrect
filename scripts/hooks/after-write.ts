// Kiro hook runner (Post Tool Use, write): keeps generated and checked files in step with
// what the agent just wrote. Runs on plain Node: `node scripts/hooks/after-write.ts`.
//  - a write under template/shim/ regenerates src/translate/shimMembers.generated.ts;
//  - a write under samples/ runs the provenance and licence checks.
// Anything else exits at once. Output on stdout is added to the agent's context.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mentionsPathUnder, parseHookInput } from './lib.ts';

let stdin = '';
try {
  stdin = readFileSync(0, 'utf8');
} catch {
  // No stdin: nothing to do.
}
const input = parseHookInput(stdin);

function run(label: string, command: string): boolean {
  try {
    execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    process.stdout.write(`${label}: ok\n`);
    return true;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    process.stderr.write(`${label}: FAILED\n${(e.stdout ?? '').slice(-3000)}\n${(e.stderr ?? e.message ?? '').slice(-2000)}\n`);
    return false;
  }
}

let ok = true;
if (mentionsPathUnder(input, 'template/shim')) {
  ok = run('Shim member table regenerated (npm run gen:shim-members)', 'npm run --silent gen:shim-members') && ok;
  try {
    const changed = execSync('git status --porcelain -- src/translate/shimMembers.generated.ts', { encoding: 'utf8' }).trim();
    if (changed !== '') {
      process.stdout.write('src/translate/shimMembers.generated.ts changed: stage it with the Shim change.\n');
    }
  } catch {
    // Not a git checkout: nothing to report.
  }
}
if (mentionsPathUnder(input, 'samples')) {
  ok = run('Sample provenance and licence checks (test/unit/provenance.test.ts)', 'npx vitest run test/unit/provenance.test.ts') && ok;
}
process.exit(ok ? 0 : 1);
