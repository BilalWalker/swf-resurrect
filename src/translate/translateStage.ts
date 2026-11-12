// IO part of the Translate stage (design 3). Reads only unpacked.scriptsDir.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { ConvertedArtifact } from '../convert/writeConverted';
import type { UnpackResult } from '../unpack/unpack';
import { ScriptsDirError } from './errors';
import { keyScriptPaths, planTranslate } from './planTranslate';
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

  const rels = new Map(paths.map((p) => [relative(dir, p).split('\\').join('/'), p]));
  const { keyed, skipped } = keyScriptPaths([...rels.keys()]);

  const sources: ScriptSource[] = [];
  for (const k of keyed) {
    sources.push({ className: k.qualified, source: await readFile(rels.get(k.path) as string, 'utf8') });
  }
  if (skipped.length > 0) {
    console.warn(`translate: skipped ${skipped.length} script(s) with no valid class name: ${skipped.join(', ')}`);
  }
  return planTranslate(sources, artifact.scene, tsSyntaxCheck, skipped);
}
