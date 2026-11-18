// Edge: regenerates src/translate/shimMembers.generated.ts from template/shim/*.ts.
// Run with `npm run gen:shim-members`.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extractShimExportNames, extractShimMembers, renderShimMembersTs } from '../src/translate/shimMembers';

const shimDir = 'template/shim';
const files = readdirSync(shimDir)
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((path) => ({ path, text: readFileSync(`${shimDir}/${path}`, 'utf8') }));
// The generated stub classes (npm run gen:api-stubs) are Shim classes like the others.
if (existsSync(`${shimDir}/stubs`)) {
  for (const f of readdirSync(`${shimDir}/stubs`).filter((n) => n.endsWith('.ts')).sort()) {
    files.push({ path: `stubs/${f}`, text: readFileSync(`${shimDir}/stubs/${f}`, 'utf8') });
  }
}

writeFileSync(
  'src/translate/shimMembers.generated.ts',
  renderShimMembersTs(extractShimMembers(files), extractShimExportNames(files)),
);
