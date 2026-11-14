// Kiro hook runner (Pre Tool Use, shell): blocks git commands that break
// .kiro/steering/git-workflow.md. Exit 0 lets the command run; exit 2 blocks it and the
// reasons on stderr go back to the agent. Runs on plain Node: `node scripts/hooks/git-guard.ts`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gitViolations, parseHookInput, shellCommandsOf } from './lib.ts';

function currentBranch(): string | null {
  try {
    return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

let stdin = '';
try {
  stdin = readFileSync(0, 'utf8');
} catch {
  // No stdin: nothing to check.
}
const commands = shellCommandsOf(parseHookInput(stdin));
const needsBranch = commands.some((c) => /\bgit\b[\s\S]*\bcommit\b/.test(c));
const ctx = { branch: needsBranch ? currentBranch() : null };
const problems = [...new Set(commands.flatMap((c) => gitViolations(c, ctx)))];
if (problems.length > 0) {
  process.stderr.write(`Blocked by .kiro/hooks/git-guard.json:\n${problems.map((p) => `- ${p}`).join('\n')}\n`);
  process.exit(2);
}
