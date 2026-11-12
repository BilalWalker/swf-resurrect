// Builds an Emitted_Project from test/fixtures/<sample>/ without Java (verify design, section 13).
// Same inputs as fixtureClasses.ts; the real emit() writes the project under .work/.

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertModel } from '../../src/convert/convertModel';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';
import type { ConvertedArtifact } from '../../src/convert/writeConverted';
import { serialiseScene } from '../../src/convert/sceneJson';
import { emit, type EmitOptions } from '../../src/emit/emit';
import { planTranslate, type ScriptSource } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import type { SceneJson } from '../../template/runtime/scene';

export interface EmittedFixtureProject {
  /** Absolute path of the emitted project. */
  projectDir: string;
  scene: SceneJson;
  /** Removes the temp directory (idempotent). */
  dispose(): Promise<void>;
}

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function emitFixtureProject(
  sample: 'clickgoto' | 'tweendemo',
  gate?: EmitOptions['gate'],
): Promise<EmittedFixtureProject> {
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
  const converted = convertModel(model);

  const scriptsDir = resolve(fixture, 'scripts');
  const names = (await readdir(scriptsDir)).filter((f) => f.endsWith('.as')).sort();
  const sources: ScriptSource[] = [];
  for (const f of names) {
    sources.push({ className: f.slice(0, -3), source: await readFile(resolve(scriptsDir, f), 'utf8') });
  }
  const artifact = planTranslate(sources, converted.scene, tsSyntaxCheck);

  const parent = resolve(repoRoot, '.work');
  await mkdir(parent, { recursive: true });
  const tempDir = await mkdtemp(resolve(parent, `emit-fixture-${sample}-`));
  const dispose = async (): Promise<void> => {
    await rm(tempDir, { recursive: true, force: true });
  };

  try {
    const stagingDir = resolve(tempDir, 'staging');
    const assetsDir = resolve(stagingDir, 'assets');
    await mkdir(assetsDir, { recursive: true });
    const svgPaths: string[] = [];
    for (const file of converted.svgFiles) {
      const path = resolve(assetsDir, file.fileName);
      await writeFile(path, file.content, 'utf8');
      svgPaths.push(path);
    }
    const scenePath = resolve(assetsDir, 'scene.json');
    await writeFile(scenePath, serialiseScene(converted.scene), 'utf8');

    const convertedArtifact: ConvertedArtifact = {
      stagingDir,
      scenePath,
      svgPaths,
      scene: converted.scene,
      unsupported: converted.unsupported,
      stats: converted.stats,
    };
    const result = await emit(convertedArtifact, {
      outputDir: resolve(tempDir, 'project'),
      force: false,
      swfPath: resolve(fixture, `${sample}.swf`),
      cwd: repoRoot,
      homeDir: homedir(),
      templateDir: resolve(repoRoot, 'template'),
      translated: artifact.classes,
      handwrittenDir: null,
      ...(gate === undefined ? {} : { gate }),
    });
    return { projectDir: result.outputDir, scene: converted.scene, dispose };
  } catch (e) {
    await dispose();
    throw e;
  }
}
