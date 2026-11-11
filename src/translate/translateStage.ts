// IO part of the Translate stage (design 3). Reads only unpacked.scriptsDir.

import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import type { ConvertedArtifact } from '../convert/writeConverted';
import type { UnpackResult } from '../unpack/unpack';
import { DuplicateClassError, ScriptsDirError } from './errors';
import { planTranslate } from './planTranslate';
import type { ScriptSource, TranslateArtifact } from './planTranslate';
import { tsSyntaxCheck } from './tsSyntaxCheck';

async function listAs(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listAs(p)));
    else if (e.isFile() && e.name.endsWith('.as')) out.push(p);
  }
  return out;
}

export async function translateStage(unpacked: UnpackResult, artifact: ConvertedArtifact): Promise<TranslateArtifact> {
  const dir = unpacked.scriptsDir;
  let paths: string[];
  try {
    paths = await listAs(dir);
  } catch (e) {
    throw new ScriptsDirError(dir, e instanceof Error ? e.message : String(e));
  }
  paths.sort((a, b) => {
    const ra = relative(dir, a);
    const rb = relative(dir, b);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });

  const byName = new Map<string, string[]>();
  for (const p of paths) {
    const name = basename(p, '.as');
    byName.set(name, [...(byName.get(name) ?? []), p]);
  }
  for (const [name, ps] of byName) {
    if (ps.length > 1) throw new DuplicateClassError(name, ps.map((p) => relative(dir, p).split('\\').join('/')));
  }

  const sources: ScriptSource[] = [];
  for (const p of paths) {
    sources.push({ className: basename(p, '.as'), source: await readFile(p, 'utf8') });
  }
  return planTranslate(sources, artifact.scene, tsSyntaxCheck);
}
