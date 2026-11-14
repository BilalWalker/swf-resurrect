// Pure logic of the Kiro hooks in .kiro/hooks/. The runners next to this file do the IO.
// Runs directly on Node (type stripping), so: erasable syntax only, node: imports only.

/** Every string found anywhere in a JSON value, depth first. */
export function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (typeof value === 'object' && value !== null) for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

/** Parses the JSON a hook receives on stdin; null when it is empty or not JSON. */
export function parseHookInput(text: string): unknown | null {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed === '') return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * The shell command of a Pre Tool Use event. Kiro documents `tool_input` but not its inner field
 * names, so the known names are tried first and every string under tool_input is the fallback.
 */
export function shellCommandsOf(input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return [];
  const toolInput = (input as Record<string, unknown>).tool_input;
  if (typeof toolInput === 'string') return [toolInput];
  if (typeof toolInput !== 'object' || toolInput === null) return [];
  for (const key of ['command', 'cmd', 'script']) {
    const v = (toolInput as Record<string, unknown>)[key];
    if (typeof v === 'string') return [v];
  }
  return allStrings(toolInput);
}

/** Removes quoted text and here-strings so words inside commit messages are never read as commands. */
export function stripQuoted(command: string): string {
  return command
    .replace(/@'[\s\S]*?'@/g, ' Q ') // PowerShell literal here-string
    .replace(/@"[\s\S]*?"@/g, ' Q ') // PowerShell expandable here-string
    .replace(/<<-?\s*'?(\w+)'?[^\n]*\n[\s\S]*?\n\s*\1\b/g, ' Q ') // POSIX heredoc
    .replace(/"(?:[^"\\`]|\\.|`.)*"/g, ' Q ')
    .replace(/'[^']*'/g, ' Q ');
}

/** Splits a shell line into simple commands, each as a list of words. */
export function simpleCommands(command: string): string[][] {
  return stripQuoted(command)
    .split(/&&|\|\||[;|\n]/)
    .map((part) => part.trim().split(/\s+/).filter((w) => w !== ''))
    .filter((words) => words.length > 0);
}

export interface GitContext {
  /** Output of `git branch --show-current`, or null when unknown. */
  branch: string | null;
}

/**
 * Reasons a shell command breaks .kiro/steering/git-workflow.md. Empty when it is allowed.
 * Only `git` invocations are looked at; everything else passes.
 */
export function gitViolations(command: string, ctx: GitContext): string[] {
  const problems: string[] = [];
  for (const words of simpleCommands(command)) {
    // git must be the command itself (after wrappers such as `&` or `cmd /c`), not an argument of another one.
    let g = 0;
    while (g < words.length && /^(&|cmd|cmd\.exe|\/c|call|command|sudo)$/i.test(words[g])) g++;
    if (g >= words.length || !/^(git|git\.exe)$/i.test(words[g])) continue;
    // Skip global options such as `git -C dir` and `git -c key=value`.
    let i = g + 1;
    while (i < words.length && words[i].startsWith('-')) i += /^-[Cc]$/.test(words[i]) ? 2 : 1;
    const sub = words[i];
    const args = words.slice(i + 1);
    const has = (...flags: string[]) => args.some((a) => flags.includes(a));
    const shortFlag = (letter: string) => args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(letter));
    switch (sub) {
      case 'push':
        problems.push('git push is not allowed: the user pushes (git-workflow.md, "Never")');
        break;
      case 'add':
        if (has('-A', '--all', '.', '*', ':/') || shortFlag('A') || shortFlag('u') || has('--update')) {
          problems.push('stage by path only: `git add -A`, `git add .` and `git add -u` are not allowed');
        }
        break;
      case 'commit':
        if (has('--amend')) problems.push('git commit --amend is not allowed: make a new commit');
        if (has('--all') || shortFlag('a')) problems.push('`git commit -a` is not allowed: stage by path, then commit');
        if (has('--no-verify') || shortFlag('n')) problems.push('git commit --no-verify is not allowed');
        if (ctx.branch === 'main') {
          problems.push('never commit on main: spec work happens on a wip/<spec> branch; stop and ask the user');
        }
        break;
      case 'rebase':
      case 'clean':
        problems.push(`git ${sub} is not allowed (git-workflow.md, "Never")`);
        break;
      case 'reset':
        if (has('--hard', '--merge', '--keep')) problems.push('git reset --hard is not allowed (git-workflow.md, "Never")');
        break;
      case 'merge':
      case 'cherry-pick':
        problems.push(`git ${sub} is not allowed: the user moves wip commits to main`);
        break;
      case 'checkout':
      case 'switch':
        if (has('main', 'master')) problems.push('do not switch to main: stay on the wip/<spec> branch');
        break;
      default:
        break;
    }
  }
  return problems;
}

/** True when any string of the event mentions a path under `dir` (forward or back slashes). */
export function mentionsPathUnder(input: unknown, dir: string): boolean {
  const want = dir.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() + '/';
  return allStrings(input).some((s) => s.replace(/\\+/g, '/').toLowerCase().includes(want));
}

export const COMMIT_AREAS = [
  'Unpack', 'Convert', 'Translate', 'Emit', 'Runtime', 'Shim', 'Pipeline', 'Verify', 'Test',
  'Spec', 'Steering', 'Build', 'Repo', 'Samples', 'Web', 'MCP', 'Hooks', 'Docs',
] as const;

/** Problems of one raw commit message (as `git log --format=%B` prints it). */
export function lintCommitMessage(raw: string): string[] {
  const problems: string[] = [];
  if (raw.startsWith('﻿')) problems.push('subject starts with a UTF-8 BOM (write the message without one)');
  const message = raw.replace(/^﻿/, '');
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  const subject = lines[0] ?? '';
  if (subject.length > 72) problems.push(`subject is ${subject.length} characters, limit 72`);
  const area = /^([A-Za-z]+): \S/.exec(subject)?.[1];
  if (area === undefined) problems.push('subject must be "Area: what changed"');
  else if (!(COMMIT_AREAS as readonly string[]).includes(area)) problems.push(`unknown area "${area}"`);
  if (lines.length > 1 && lines[1].trim() !== '') problems.push('second line must be blank');
  if (lines.slice(2).every((l) => l.trim() === '')) problems.push('body is missing (why, and how it was verified)');
  if (/^\s*Co-Authored-By:/im.test(message)) problems.push('attribution trailer lines are not allowed');
  if (/Generated with/i.test(message)) problems.push('"Generated with" lines are not allowed');
  if (/\p{Extended_Pictographic}/u.test(message)) problems.push('emoji are not allowed');
  return problems;
}

/** Paths that must never be committed (git-workflow.md, "Never"). */
export function forbiddenPaths(paths: readonly string[]): string[] {
  return paths.filter((p) => /^(tools|node_modules|out|\.work|dist)\//.test(p.replace(/\\/g, '/')));
}
