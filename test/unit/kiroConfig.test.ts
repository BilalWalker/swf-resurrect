// Keeps the Kiro configuration under .kiro/ in step with the code it points at.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTools } from '../../mcp/swf-inspector/tools';

/** The YAML front matter block of a Markdown file, or null. */
function frontMatter(text: string): string | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  return m === null ? null : m[1];
}

describe('.kiro/settings/mcp.json', () => {
  const doc = JSON.parse(readFileSync('.kiro/settings/mcp.json', 'utf8'));
  const servers = doc.mcpServers as Record<string, { command: string; args: string[]; autoApprove: string[]; disabled: boolean }>;

  it('declares the swf-inspector and playwright servers as stdio commands', () => {
    expect(Object.keys(servers).sort()).toEqual(['playwright', 'swf-inspector']);
    for (const s of Object.values(servers)) {
      expect(typeof s.command).toBe('string');
      expect(Array.isArray(s.args)).toBe(true);
      expect(s.disabled).toBe(false);
    }
  });

  it('starts the inspector from a file that exists and matches the npm script', () => {
    const entry = servers['swf-inspector'].args.at(-1)!;
    expect(existsSync(entry)).toBe(true);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts['mcp:swf-inspector']).toBe(`tsx ${entry}`);
  });

  it('auto-approves exactly the inspector tools (all are read-only)', () => {
    const names = createTools({ repoRoot: '.', jarPath: 'x', cacheDir: 'x' }).map((t) => t.name);
    expect([...servers['swf-inspector'].autoApprove].sort()).toEqual([...names].sort());
  });

  it('pins the playwright MCP package to an exact version', () => {
    const pkgArg = servers.playwright.args.find((a) => a.startsWith('@playwright/mcp'));
    expect(pkgArg).toMatch(/^@playwright\/mcp@\d+\.\d+\.\d+$/);
  });
});

describe('.kiro/agents', () => {
  it('fidelity-reviewer has front matter with a name, a description and no write access', () => {
    const text = readFileSync('.kiro/agents/fidelity-reviewer.md', 'utf8');
    const fm = frontMatter(text);
    expect(fm).not.toBeNull();
    expect(fm).toMatch(/^name: fidelity-reviewer$/m);
    expect(fm).toMatch(/^description: \S/m);
    expect(fm).toMatch(/capability: fs_write[\s\S]*?effect: deny/);
    expect(fm).not.toMatch(/"write"/);
    // The prompt names files; they must exist.
    for (const path of ['test/unit/clickgotoReplay.test.ts', 'test/e2e/overallMatch.e2e.test.ts', 'src/verify/core/pixelDiff.ts', 'scripts/hooks/after-task.ts']) {
      expect(text).toContain(path);
      expect(existsSync(path), path).toBe(true);
    }
  });
});

describe('.kiro/steering', () => {
  const files = readdirSync('.kiro/steering').filter((f) => f.endsWith('.md'));

  it('flash-behaviour.md is included by file match and names files that exist', () => {
    const text = readFileSync('.kiro/steering/flash-behaviour.md', 'utf8');
    const fm = frontMatter(text);
    expect(fm).toMatch(/^inclusion: fileMatch$/m);
    expect(fm).toMatch(/^fileMatchPattern: \[.*"template\/\*\*\/\*\.ts".*\]$/m);
    expect(existsSync('src/convert/ffdecXml.ts')).toBe(true);
    expect(existsSync('template/runtime/svgFlatten.ts')).toBe(true);
  });

  it('kiro-tooling.md lists every inspector tool and every hook', () => {
    const text = readFileSync('.kiro/steering/kiro-tooling.md', 'utf8');
    for (const t of createTools({ repoRoot: '.', jarPath: 'x', cacheDir: 'x' })) expect(text).toContain(`\`${t.name}\``);
    for (const file of readdirSync('.kiro/hooks').filter((f) => f.endsWith('.json'))) {
      for (const hook of JSON.parse(readFileSync(`.kiro/hooks/${file}`, 'utf8')).hooks) expect(text).toContain(`**${hook.name}**`);
    }
  });

  it('a steering file with front matter starts with it', () => {
    for (const f of files) {
      const text = readFileSync(`.kiro/steering/${f}`, 'utf8');
      if (text.includes('\ninclusion:')) expect(frontMatter(text), f).not.toBeNull();
    }
  });
});
