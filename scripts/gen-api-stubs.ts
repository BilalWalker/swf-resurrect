// Edge: writes template/shim/stubs/<Class>.ts from the `stub` entries of src/translate/flashApiTable.ts.
// Run with `npm run gen:api-stubs`, then `npm run gen:shim-members`. Files of classes that left the table are removed.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { renderAllStubs } from '../src/translate/renderApiStubs';

const dir = 'template/shim/stubs';
mkdirSync(dir, { recursive: true });
const stubs = renderAllStubs();
const wanted = new Set(stubs.map((s) => s.file));
for (const f of readdirSync(dir)) if (f.endsWith('.ts') && !wanted.has(f)) rmSync(`${dir}/${f}`);
for (const s of stubs) writeFileSync(`${dir}/${s.file}`, s.text);
