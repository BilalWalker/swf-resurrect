// Edge: regenerates src/translate/shimMembers.generated.ts from template/shim/*.ts.
// Run with `npm run gen:shim-members`.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extractShimMembers, renderShimMembersTs } from '../src/translate/shimMembers';

const shimDir = 'template/shim';
const files = readdirSync(shimDir)
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((path) => ({ path, text: readFileSync(`${shimDir}/${path}`, 'utf8') }));

writeFileSync('src/translate/shimMembers.generated.ts', renderShimMembersTs(extractShimMembers(files)));
