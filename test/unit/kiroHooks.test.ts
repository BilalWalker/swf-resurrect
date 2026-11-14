import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  allStrings,
  COMMIT_AREAS,
  forbiddenPaths,
  gitViolations,
  lintCommitMessage,
  mentionsPathUnder,
  parseHookInput,
  shellCommandsOf,
  simpleCommands,
  stripQuoted,
} from '../../scripts/hooks/lib.ts';

const wip = { branch: 'wip/breadth' };
// Built from parts so this file never holds the literal trailer text.
const TRAILER = ['Co', 'Authored', 'By'].join('-');

describe('hook input', () => {
  it('parses JSON, tolerating a BOM, and gives null for empty or broken input', () => {
    expect(parseHookInput('\uFEFF{"a":1}')).toEqual({ a: 1 });
    expect(parseHookInput('')).toBeNull();
    expect(parseHookInput('{nope')).toBeNull();
  });

  it('finds the shell command under the known field names, else every string of tool_input', () => {
    expect(shellCommandsOf({ tool_name: 'shell', tool_input: { command: 'git status' } })).toEqual(['git status']);
    expect(shellCommandsOf({ tool_input: 'git status' })).toEqual(['git status']);
    expect(shellCommandsOf({ tool_input: { other: { deep: 'git push' }, n: 1 } })).toEqual(['git push']);
    expect(shellCommandsOf({})).toEqual([]);
    expect(shellCommandsOf(null)).toEqual([]);
  });

  it('collects strings depth first', () => {
    expect(allStrings({ a: 'x', b: ['y', { c: 'z' }], d: 4 })).toEqual(['x', 'y', 'z']);
  });
});

describe('command splitting', () => {
  it('drops quoted text and here-strings', () => {
    expect(stripQuoted(`git commit -m "never git push"`)).not.toContain('push');
    expect(stripQuoted(`git commit -m 'git add -A'`)).not.toContain('add');
    expect(stripQuoted(`git commit -F - <<'EOF'\nSpec: x\n\ngit push here\nEOF`)).not.toContain('push');
    expect(stripQuoted(`$m = @'\ngit rebase\n'@; git commit -F msg.txt`)).not.toContain('rebase');
  });

  it('splits on ;, &&, ||, | and newlines', () => {
    expect(simpleCommands('git status; npm test && git add a.ts || echo x | cat\ngit log')).toEqual([
      ['git', 'status'],
      ['npm', 'test'],
      ['git', 'add', 'a.ts'],
      ['echo', 'x'],
      ['cat'],
      ['git', 'log'],
    ]);
  });
});

describe('gitViolations', () => {
  it.each([
    'git status',
    'git add src/a.ts test/unit/a.test.ts',
    'git add .kiro/specs/breadth/tasks.md',
    'git add -p src/a.ts',
    'git commit -F msg.txt',
    'git commit -m "Spec: never git push or git add -A"',
    'git diff --cached --name-only',
    'git log --oneline -5',
    'git reset HEAD src/a.ts',
    'git checkout -- src/a.ts',
    'git branch --show-current',
    'git -C sub status',
    'npm run typecheck; npx vitest related --run src/a.ts',
    'echo git push',
    'git stash',
  ])('allows %j', (command) => {
    expect(gitViolations(command, wip)).toEqual([]);
  });

  it.each([
    ['git push', /push/],
    ['git push origin wip/breadth --force', /push/],
    ['npm test && git push', /push/],
    ['git -C . push', /push/],
    ['git.exe push', /push/],
    ['& git push', /push/],
    ['cmd /c git push', /push/],
    ['git add -A', /stage by path/],
    ['git add --all', /stage by path/],
    ['git add .', /stage by path/],
    ['git add -u', /stage by path/],
    ['git commit -a -m "x"', /commit -a/],
    ['git commit -am "x"', /commit -a/],
    ['git commit --amend --no-edit', /amend/],
    ['git commit --no-verify -F m.txt', /no-verify/],
    ['git rebase main', /rebase/],
    ['git reset --hard HEAD~1', /reset --hard/],
    ['git clean -fd', /clean/],
    ['git merge main', /merge/],
    ['git cherry-pick abc123', /cherry-pick/],
    ['git checkout main', /switch to main/],
    ['git switch main', /switch to main/],
  ])('blocks %j', (command, reason) => {
    expect(gitViolations(command, wip).join('\n')).toMatch(reason);
  });

  it('blocks any commit while on main, and nothing else there', () => {
    expect(gitViolations('git commit -F m.txt', { branch: 'main' }).join()).toMatch(/never commit on main/);
    expect(gitViolations('git status', { branch: 'main' })).toEqual([]);
    expect(gitViolations('git commit -F m.txt', { branch: null })).toEqual([]);
  });

  it('reports each problem of a compound command', () => {
    expect(gitViolations('git add -A; git commit --amend; git push', wip)).toHaveLength(3);
  });
});

describe('mentionsPathUnder', () => {
  it('matches forward and back slashes, any case, anywhere in the event', () => {
    expect(mentionsPathUnder({ tool_input: { path: 'template/shim/MovieClip.ts' } }, 'template/shim')).toBe(true);
    expect(mentionsPathUnder({ tool_input: { file: 'D:\\repo\\template\\shim\\Sprite.ts' } }, 'template/shim')).toBe(true);
    expect(mentionsPathUnder({ tool_input: { file: 'D:\\\\repo\\\\Samples\\\\x\\\\test.swf' } }, 'samples')).toBe(true);
    expect(mentionsPathUnder({ tool_input: { path: 'template/shimmy.ts' } }, 'template/shim')).toBe(false);
    expect(mentionsPathUnder({ tool_input: { path: 'src/emit/emit.ts' } }, 'samples')).toBe(false);
  });
});

describe('lintCommitMessage', () => {
  const good = 'Translate: resolve dotted type annotations (20.1)\n\nWhy it exists.\nVerified: npm run typecheck.';

  it('accepts a message in the house form', () => {
    expect(lintCommitMessage(good)).toEqual([]);
  });

  it.each([
    ['\uFEFF' + good, /BOM/],
    ['Translate: ' + 'x'.repeat(70) + '\n\nbody', /limit 72/],
    ['resolve dotted type annotations\n\nbody', /Area: what changed/],
    ['Spec task 7.9 (spec amendment, user-approved)\n\nbody', /Area: what changed/],
    ['Tranlsate: fix it\n\nbody', /unknown area "Tranlsate"/],
    ['Translate: fix it\nno blank line\n\nbody', /second line must be blank/],
    ['Translate: fix it', /body is missing/],
    [`${good}\n\n${TRAILER}: Someone <a@b.c>`, /trailer lines are not allowed/],
    [`${good}\n\nGenerated with a tool`, /Generated with/],
    [`${good} \u{1F47B}`, /emoji/],
  ])('reports %j', (message, reason) => {
    expect(lintCommitMessage(message).join('\n')).toMatch(reason);
  });

  it('knows the areas of git-workflow.md', () => {
    const steering = readFileSync('.kiro/steering/git-workflow.md', 'utf8');
    const from = steering.indexOf('Areas in use');
    const listed = [...steering.slice(from, steering.indexOf('\n4.', from)).matchAll(/`([A-Z][A-Za-z]+)`/g)].map((m) => m[1]);
    expect(listed.length).toBeGreaterThan(5);
    for (const area of listed) expect(COMMIT_AREAS).toContain(area);
  });
});

describe('forbiddenPaths', () => {
  it('names files that must never be committed', () => {
    expect(
      forbiddenPaths(['src/a.ts', 'tools/ffdec/ffdec-cli.jar', 'out\\x\\index.html', '.work/a', 'dist/b', 'node_modules/c', 'toolsmith.ts']),
    ).toEqual(['tools/ffdec/ffdec-cli.jar', 'out\\x\\index.html', '.work/a', 'dist/b', 'node_modules/c']);
  });
});

describe('git-guard runner', () => {
  const run = (stdin: string) => spawnSync(process.execPath, ['scripts/hooks/git-guard.ts'], { input: stdin, encoding: 'utf8' });

  it('exits 0 for an allowed command and for empty or broken input', () => {
    const allowed = { hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command: 'git status' } };
    expect(run(JSON.stringify(allowed)).status).toBe(0);
    expect(run('').status).toBe(0);
    expect(run('{nope').status).toBe(0);
  });

  it('exits 2 with the reasons on stderr for a blocked command', () => {
    const r = run(JSON.stringify({ tool_name: 'shell', tool_input: { command: 'git add -A; git push' } }));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/stage by path/);
    expect(r.stderr).toMatch(/git push is not allowed/);
    expect(r.stdout).toBe('');
  });
});

describe('.kiro/hooks files', () => {
  const dir = '.kiro/hooks';
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('has the three hook files', () => {
    expect([...files].sort()).toEqual(['generated-files.json', 'git-guard.json', 'task-hygiene.json']);
  });

  it.each(files)('%s follows the v1 schema, uses command actions only and points at an existing script', (file) => {
    const doc = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
    expect(doc.version).toBe('v1');
    expect(Array.isArray(doc.hooks) && doc.hooks.length > 0).toBe(true);
    for (const hook of doc.hooks) {
      expect(typeof hook.name).toBe('string');
      expect(typeof hook.description).toBe('string');
      expect(['PreToolUse', 'PostToolUse', 'PostTaskExecution']).toContain(hook.trigger);
      // Command actions run locally and use no credits; an agent action would start a new agent loop.
      expect(hook.action.type).toBe('command');
      const script = /^node (scripts\/hooks\/[\w-]+\.ts)$/.exec(hook.action.command)?.[1];
      expect(script, hook.action.command).toBeDefined();
      expect(existsSync(script!)).toBe(true);
      expect(hook.timeout).toBeGreaterThan(0);
    }
  });
});
