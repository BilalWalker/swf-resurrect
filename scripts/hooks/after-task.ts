// Kiro hook runner (Post Task Execution, trigger `PostTaskExec`): checks the commits of the current wip branch and
// the staged files against .kiro/steering/git-workflow.md, right after a spec task ends.
// Read-only. Problems go to stderr with exit 1 so the agent sees them; a clean result prints
// one line. Runs on plain Node: `node scripts/hooks/after-task.ts`.
import { execFileSync } from 'node:child_process';
import { forbiddenPaths, lintCommitMessage } from './lib.ts';

function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return null;
  }
}

const problems: string[] = [];
const branch = git('branch', '--show-current')?.trim() ?? '';
if (branch === 'main') problems.push('the current branch is main: spec work belongs on a wip/<spec> branch');

// Commits on this branch that main does not have, newest first, at most 30.
const hashes = (git('rev-list', '--max-count=30', 'main..HEAD') ?? '').split('\n').filter((h) => h !== '');
for (const hash of hashes) {
  const raw = git('log', '-1', '--format=%B', hash) ?? '';
  for (const p of lintCommitMessage(raw.replace(/\n+$/, ''))) problems.push(`commit ${hash.slice(0, 7)}: ${p}`);
  const files = (git('show', '--name-only', '--format=', hash) ?? '').split('\n').filter((f) => f !== '');
  for (const f of forbiddenPaths(files)) problems.push(`commit ${hash.slice(0, 7)}: contains ${f}, which must never be committed`);
}

const staged = (git('diff', '--cached', '--name-only') ?? '').split('\n').filter((f) => f !== '');
for (const f of forbiddenPaths(staged)) problems.push(`staged: ${f} must never be committed`);

// The after-write hook regenerates the Shim member table silently (Kiro does not pass the output of a
// successful Post Tool Use command hook on to the agent), so an uncommitted table is reported here.
const table = 'src/translate/shimMembers.generated.ts';
if ((git('status', '--porcelain', '--', table) ?? '').trim() !== '') {
  problems.push(`${table} was regenerated but is not committed: commit it with the Shim change that caused it`);
}

if (problems.length > 0) {
  process.stderr.write(
    `Commit hygiene (.kiro/hooks/task-hygiene.json) found ${problems.length} problem(s):\n` +
      `${problems.map((p) => `- ${p}`).join('\n')}\n` +
      'Do not amend or rebase. Fix what can be fixed in a new commit and tell the user about the rest.\n',
  );
  process.exit(1);
}
process.stdout.write(`Commit hygiene: ${hashes.length} commit(s) on ${branch || 'this branch'} checked, no problems.\n`);
