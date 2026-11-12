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

  describe('syntactic and specifier marks (design 19.3)', () => {
    const run = (text: string) => {
      const files = project();
      files.set('src/Bad.ts', text);
      return typeCheckProject({ files, repoRoot }).errors;
    };

    it('marks a missing } as syntactic and the other errors of the file as not', () => {
      const errors = run('export class Bad {\n  public f(): number { return y; }\n');
      const e1005 = errors.filter((e) => e.code === 1005);
      expect(e1005.length).toBeGreaterThan(0);
      expect(e1005.every((e) => e.syntactic)).toBe(true);
      const others = errors.filter((e) => e.code !== 1005);
      expect(others.length).toBeGreaterThan(0);
      expect(others.every((e) => !e.syntactic)).toBe(true);
    });

    it('does not mark TS1155, TS2451, TS2303 or TS2459 as syntactic', () => {
      const files = project();
      files.set('src/Bad.ts', 'export const q;\nlet r = 1;\nlet r = 2;\n');
      files.set('src/P.ts', "import Q = require('./Q');\nexport = Q;\n");
      files.set('src/Q.ts', "import P = require('./P');\nexport = P;\n");
      files.set('src/Imp.ts', "import { Hidden } from './Priv';\n");
      files.set('src/Priv.ts', 'const Hidden = 1;\nexport {};\n');
      const errors = typeCheckProject({ files, repoRoot }).errors;
      const wanted = errors.filter((e) => [1155, 2451, 2303, 2459].includes(e.code));
      expect(new Set(wanted.map((e) => e.code))).toEqual(new Set([1155, 2451, 2303, 2459]));
      expect(wanted.every((e) => !e.syntactic)).toBe(true);
    });

    it('reads the specifier of two TS2307 as written', () => {
      const errors = run("import { Nope } from './Nope';\nimport { X } from '../shim/Missing';\n");
      const e2307 = errors.filter((e) => e.code === 2307);
      expect(e2307.map((e) => e.specifier)).toEqual(['./Nope', '../shim/Missing']);
    });

    it('gives TS2882 for a side-effect package import no specifier', () => {
      const errors = run("import 'pixi.js/nope';\n");
      const e = errors.find((x) => x.code === 2882 || x.code === 2307);
      expect(e?.code).toBe(2882);
      expect(e?.specifier).toBeNull();
    });

    it('marks TS2322, TS2339 and TS2304 as not syntactic with no specifier', () => {
      const errors = run('const a: number = "x";\nconst b = { }.nope;\nconst c: Missing = 1;\n');
      for (const code of [2322, 2339, 2304]) {
        const e = errors.find((x) => x.code === code);
        expect(e, `TS${code}`).toBeDefined();
        expect(e?.syntactic).toBe(false);
        expect(e?.specifier).toBeNull();
      }
    });

    it('keeps the list and its order apart from the two new fields', () => {
      const errors = run("import { y } from 'no-such-package-xyz';\nconst a: number = 'x';\nconst c: Missing = 1;\n");
      const key = (e: { file: string; line: number; column: number; code: number; message: string }) =>
        [e.file, e.line, e.column, e.code, e.message] as const;
      const sorted = [...errors].sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        for (let i = 0; i < ka.length; i++) {
          if (ka[i] < kb[i]) return -1;
          if (ka[i] > kb[i]) return 1;
        }
        return 0;
      });
      expect(errors).toEqual(sorted);
      expect(errors.map((e) => e.code)).toEqual([2307, 2322, 2304]);
      for (const e of errors) expect(Object.keys(e).sort()).toEqual(['code', 'column', 'file', 'line', 'message', 'specifier', 'syntactic']);
    });
  });

  it('uses the pixi.js version the emitted package.json pins', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'node_modules/pixi.js/package.json'), 'utf8'));
    expect(pkg.version).toBe(PIXI_VERSION);
  });
});
