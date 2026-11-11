// IO part of the converter (design, "Converter writer").
// The pure step runs before any write, so a conversion error leaves no output.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SceneJson } from '../../template/runtime/scene';
import type { UnsupportedFeatureEntry } from '../pipeline/unsupported';
import type { UnpackResult } from '../unpack/unpack';
import { convertModel } from './convertModel';
import type { ConvertResult } from './convertModel';
import { readUnpacked } from './readUnpacked';
import { serialiseScene } from './sceneJson';

export interface ConvertedArtifact {
  stagingDir: string; // <workDir>/converted
  scenePath: string; // <stagingDir>/assets/scene.json
  svgPaths: string[]; // absolute, sorted by id
  scene: SceneJson; // kept in memory for the Emitter (class registry)
  unsupported: UnsupportedFeatureEntry[];
  stats: ConvertResult['stats'];
}

export async function convertStage(unpacked: UnpackResult): Promise<ConvertedArtifact> {
  const model = await readUnpacked(unpacked);
  const result = convertModel(model); // before any write

  const stagingDir = join(unpacked.workDir, 'converted');
  const assetsDir = join(stagingDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const svgPaths: string[] = [];
  for (const file of result.svgFiles) {
    const path = join(assetsDir, file.fileName);
    await writeFile(path, file.content, 'utf8');
    svgPaths.push(path);
  }

  // scene.json last, through a temp file, so a partial scene file never exists.
  const scenePath = join(assetsDir, 'scene.json');
  const tmpPath = `${scenePath}.tmp`;
  await writeFile(tmpPath, serialiseScene(result.scene), 'utf8');
  await rename(tmpPath, scenePath);

  return {
    stagingDir,
    scenePath,
    svgPaths,
    scene: result.scene,
    unsupported: result.unsupported,
    stats: result.stats,
  };
}
