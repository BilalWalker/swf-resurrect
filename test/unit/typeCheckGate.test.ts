import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { PIXI_VERSION } from '../../src/emit/versions';
import { typeCheckProject } from '../../src/translate/typeCheckGate';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const templateDir = join(repoRoot, 'template');

function readTree(dir: string, prefix = ''): [string, string][] {
  const out: [string, string][] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTree(full, `${prefix}${name}/`));
    else if (name !== '.gitkeep') out.push([`${prefix}${name}`, readFileSync(full, 'utf8').replace(/\r\n/g, '\n')]);
  }
  return out;
}

const LEFT = `import { MovieClip } from '../shim';
export class LeftButton extends MovieClip {
  public go(): number { return 1; }
}
`;

function project(): Map<string, string> {
  const files = new Map(readTree(templateDir));
  files.set('src/LeftButton.ts', LEFT);
  return files;
}

// Each case builds a full TypeScript program (lib.dom + pixi types); allow time under load.
vi.setConfig({ testTimeout: 60_000 });

describe('typeCheckProject', () => {
  it('reports no errors for a clean emitted project (pixi.js resolves)', () => {
    expect(typeCheckProject({ files: project(), repoRoot }).errors).toEqual([]);
  });

  it('attributes an injected error in a class file to src/LeftButton.ts', () => {
    const files = project();
    files.set('src/LeftButton.ts', LEFT.replace('return 1', "return 'x'"));
    const { errors } = typeCheckProject({ files, repoRoot });
    expect(errors.map((e) => e.file)).toEqual(['src/LeftButton.ts']);
    expect(errors[0].line).toBe(3);
    expect(errors[0].code).toBe(2322);
  });

  it('attributes an injected error in runtime code to runtime/player.ts', () => {
    const files = project();
    files.set('runtime/player.ts', files.get('runtime/player.ts')! + '\nexport const bad: number = "s";\n');
    const { errors } = typeCheckProject({ files, repoRoot });
    expect(errors.map((e) => e.file)).toEqual(['runtime/player.ts']);
  });

  it('reports an unresolvable package as TS2307', () => {
    const files = project();
    files.set('src/Bad.ts', "import { y } from 'no-such-package-xyz';\n");
    const { errors } = typeCheckProject({ files, repoRoot });
    expect(errors.some((e) => e.file === 'src/Bad.ts' && e.code === 2307)).toBe(true);
  });

  it('puts no absolute path in any message', () => {
    const files = project();
    files.set('src/Bad.ts', "import { y } from 'no-such-package-xyz';\nimport { x } from './missing';\n");
    const { errors } = typeCheckProject({ files, repoRoot });
    expect(errors.length).toBeGreaterThan(0);
    const norm = repoRoot.replace(/\\/g, '/').replace(/\/$/, '');
    for (const e of errors) {
      expect(e.message).not.toContain(norm);
      expect(e.message).not.toContain('__gate__');
      expect(e.message).not.toMatch(/[A-Za-z]:[\\/]/);
    }
  });

  it('is deterministic', () => {
    const files = project();
    files.set('src/LeftButton.ts', LEFT.replace('return 1', "return 'x'"));
    expect(typeCheckProject({ files, repoRoot })).toEqual(typeCheckProject({ files, repoRoot }));
  });

  it('uses the pixi.js version the emitted package.json pins', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'node_modules/pixi.js/package.json'), 'utf8'));
    expect(pkg.version).toBe(PIXI_VERSION);
  });
});
