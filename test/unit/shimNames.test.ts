import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as shim from '../../template/shim/index';
import { extractShimExportNames } from '../../src/translate/shimMembers';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { stubClasses } from '../../src/translate/flashApiTable';

function shimSources() {
  return readdirSync('template/shim')
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((path) => ({ path, text: readFileSync(`template/shim/${path}`, 'utf8') }));
}

describe('SHIM_AS3_NAMES (Requirement 2.3, design D1)', () => {
  it('holds every value export of template/shim/index.ts, Stage included', () => {
    expect(SHIM_AS3_NAMES.has('Stage')).toBe(true);
    expect([...SHIM_AS3_NAMES].sort()).toEqual(extractShimExportNames(shimSources()));
    for (const name of Object.keys(shim)) expect(SHIM_AS3_NAMES.has(name), name).toBe(true);
    for (const name of SHIM_AS3_NAMES) expect(name in shim, name).toBe(true);
  });

  it('holds every stub class of the Flash_API_Table (task 14.2)', () => {
    for (const q of stubClasses()) expect(SHIM_AS3_NAMES.has(q.split('.').pop()!), q).toBe(true);
  });

  it('has no Proxy export (Requirement 20.5)', () => {
    expect(SHIM_AS3_NAMES.has('Proxy')).toBe(false);
    expect('Proxy' in shim).toBe(false);
    expect(extractShimExportNames(shimSources())).not.toContain('Proxy');
  });
  it('skips export type clauses', () => {
    const names = extractShimExportNames([
      { path: 'index.ts', text: "export { A, b } from './a';\nexport type { T } from './a';\nexport { type U, C } from './c';\n" },
    ]);
    expect(names).toEqual(['A', 'C', 'b']);
  });
});
