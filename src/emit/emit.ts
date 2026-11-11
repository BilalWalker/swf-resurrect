// IO part of the Emitter, including --force safety checks and deletion.
import { mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { ConvertedArtifact } from '../convert/writeConverted';
import { serialiseScene } from '../convert/sceneJson';
import type { SvgFile } from '../convert/convertModel';
import { OutputDirNotEmptyError, UnsafeForceTargetError } from './errors';
import { checkForceTarget } from './forceSafety';
import { planEmit } from './planEmit';
import type { EmittedFile, HandwrittenClass, TemplateFile } from './planEmit';

export interface EmitOptions {
  outputDir: string;
  force: boolean;
  swfPath: string; // only used for the force-safety check
  cwd: string;
  homeDir: string;
  templateDir: string;
  handwrittenDir: string | null;
}

export interface EmitResult {
  outputDir: string; // resolved absolute path
  files: string[]; // posix paths relative to outputDir, sorted
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** path.resolve, then realpath on the deepest existing ancestor, re-appending missing segments. */
async function resolveOutputDir(outputDir: string): Promise<string> {
  const abs = resolve(outputDir);
  const missing: string[] = [];
  let current = abs;
  for (;;) {
    try {
      const real = await realpath(current);
      return join(real, ...missing.reverse());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      const parent = dirname(current);
      if (parent === current) return abs;
      missing.push(basename(current));
      current = parent;
    }
  }
}

async function directoryEntries(dir: string): Promise<string[] | null> {
  try {
    return await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function loadTemplates(dir: string, prefix = ''): Promise<TemplateFile[]> {
  const out: TemplateFile[] = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => byCodeUnit(a.name, b.name));
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await loadTemplates(join(dir, entry.name), rel)));
    else if (entry.isFile()) out.push({ path: rel, content: await readFile(join(dir, entry.name), 'utf8') });
  }
  return out;
}

async function loadHandwritten(dir: string | null): Promise<HandwrittenClass[]> {
  if (dir === null) return [];
  const names = (await readdir(dir)).filter((n) => n.endsWith('.ts')).sort(byCodeUnit);
  const out: HandwrittenClass[] = [];
  for (const fileName of names) {
    out.push({
      className: fileName.replace(/\.ts$/, ''),
      fileName,
      source: await readFile(join(dir, fileName), 'utf8'),
    });
  }
  return out;
}

export async function emit(artifact: ConvertedArtifact, options: EmitOptions): Promise<EmitResult> {
  const outputDir = await resolveOutputDir(options.outputDir);

  const existing = await directoryEntries(outputDir);
  if (existing !== null && existing.length > 0 && !options.force) {
    throw new OutputDirNotEmptyError(outputDir);
  }
  if (options.force) {
    // Compare real paths so links in cwd or the SWF location cannot hide an unsafe target.
    const refusal = checkForceTarget(outputDir, {
      cwd: await resolveOutputDir(options.cwd),
      homeDir: await resolveOutputDir(options.homeDir),
      swfPath: join(await resolveOutputDir(dirname(options.swfPath)), basename(options.swfPath)),
    });
    if (refusal !== null) throw new UnsafeForceTargetError(outputDir, refusal);
  }

  const svgFiles: SvgFile[] = [];
  for (const path of artifact.svgPaths) {
    svgFiles.push({ fileName: basename(path), content: await readFile(path, 'utf8') });
  }
  const plan: EmittedFile[] = planEmit(
    {
      scene: artifact.scene,
      sceneJson: serialiseScene(artifact.scene),
      templates: await loadTemplates(options.templateDir),
      handwritten: await loadHandwritten(options.handwrittenDir),
    },
    svgFiles,
  );

  if (options.force && existing !== null) {
    // fs.rm does not follow links: a link is removed, its target survives.
    for (const name of existing) {
      await rm(join(outputDir, name), { recursive: true, force: true });
    }
  }

  for (const file of plan) {
    const target = join(outputDir, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
  return { outputDir, files: plan.map((f) => f.path) };
}
