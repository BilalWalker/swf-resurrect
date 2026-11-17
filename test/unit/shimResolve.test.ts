// vitest resolves '../shim' of a translated class to the Shim of its own Emitted_Project, so the classes and the project's
// Player share one Shim instance (one construction context, one Stage). Elsewhere it is template/shim (as3-coverage task 31).
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { shimResolve } from '../../vitest.config';

describe('shimResolve', () => {
  const project = mkdtempSync(join(tmpdir(), 'shim-resolve-'));
  mkdirSync(join(project, 'shim'));
  mkdirSync(join(project, 'src'));
  writeFileSync(join(project, 'shim', 'index.ts'), 'export {};\n');
  afterAll(() => rmSync(project, { recursive: true, force: true }));

  it("maps '../shim' of a class inside an Emitted_Project to that project's shim/index.ts", () => {
    expect(shimResolve('../shim', join(project, 'src', 'Fixture.ts'))).toBe(join(project, 'shim', 'index.ts'));
  });
  it('accepts a file URL importer', () => {
    expect(shimResolve('../shim', pathToFileURL(join(project, 'src', 'Fixture.ts')).href)).toBe(join(project, 'shim', 'index.ts'));
  });
  it('falls back to template/shim when the importer has no sibling shim, and ignores other specifiers', () => {
    expect(shimResolve('../shim', join(project, 'src', 'nested', 'Deep.ts'))).toMatch(/template[\\/]shim[\\/]index\.ts$/);
    expect(shimResolve('../shim', undefined)).toMatch(/template[\\/]shim[\\/]index\.ts$/);
    expect(shimResolve('./shim', join(project, 'src', 'Fixture.ts'))).toBeNull();
  });
});
