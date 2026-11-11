// Fixture_Classes loader (design 9): transpiles the fixture .as files with the real
// Transpiler and imports the generated .ts so tests run translated, not handwritten, classes.

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { convertModel } from '../../src/convert/convertModel';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { planTranslate, type ScriptSource, type TranslatedClass } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import type { MovieClip } from '../../template/shim/MovieClip';
import { setTraceSink } from '../../template/shim/trace';

export interface FixtureClasses {
  /** Every translated class that is linked in the Scene_JSON (the Player classRegistry). */
  classes: Record<string, new () => MovieClip>;
  /** Every emitted translated class (including bases such as EventWatcher), by name. */
  results: Map<string, TranslatedClass>;
  /** Removes the temp directory and restores the trace sink. */
  dispose(): Promise<void>;
}

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function loadFixtureClasses(sample: 'clickgoto' | 'tweendemo'): Promise<FixtureClasses> {
  const fixture = resolve(repoRoot, 'test/fixtures', sample);
  const { xmlVersion, header } = readDumpHeader(await readFile(resolve(fixture, 'structure.xml'), 'utf8'));
  const model = await readUnpacked({
    workDir: fixture,
    shapesDir: resolve(fixture, 'shapes'),
    structureDumpPath: resolve(fixture, 'structure.xml'),
    symbolClassPath: resolve(fixture, 'symbols.csv'),
    scriptsDir: resolve(fixture, 'scripts'),
    header,
    xmlVersion,
  });
  const scene = convertModel(model).scene;

  const scriptsDir = resolve(fixture, 'scripts');
  const names = (await readdir(scriptsDir)).filter((f) => f.endsWith('.as')).sort();
  const sources: ScriptSource[] = [];
  for (const f of names) {
    sources.push({ className: f.slice(0, -3), source: await readFile(resolve(scriptsDir, f), 'utf8') });
  }
  const artifact = planTranslate(sources, scene, tsSyntaxCheck);

  const parent = resolve(repoRoot, '.work/fixture-classes');
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(resolve(parent, `${sample}-`));

  setTraceSink(() => {});
  const dispose = async (): Promise<void> => {
    setTraceSink(null);
    await rm(dir, { recursive: true, force: true });
  };

  try {
    for (const c of artifact.classes) await writeFile(resolve(dir, c.fileName), c.text, 'utf8');

    const linked = new Set<string>();
    for (const sym of Object.values(scene.symbols)) {
      const name = (sym as { className?: string }).className;
      if (name !== undefined) linked.add(name);
    }

    const classes: Record<string, new () => MovieClip> = {};
    const results = new Map<string, TranslatedClass>();
    for (const c of artifact.classes) {
      results.set(c.className, c);
      const mod = (await import(/* @vite-ignore */ pathToFileURL(resolve(dir, c.fileName)).href)) as Record<string, unknown>;
      if (linked.has(c.className)) {
        const ctor = mod[c.className];
        if (typeof ctor !== 'function') throw new Error(`${c.fileName} does not export ${c.className}`);
        classes[c.className] = ctor as new () => MovieClip;
      }
    }
    return { classes, results, dispose };
  } catch (e) {
    await dispose();
    throw e;
  }
}
