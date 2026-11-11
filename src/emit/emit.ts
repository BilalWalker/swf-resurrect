// IO part of the Emitter, including --force safety checks and deletion.
import { access, mkdir, readdir, readFile, realpath, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import type { ConvertedArtifact } from '../convert/writeConverted';
import { serialiseScene } from '../convert/sceneJson';
import type { SvgFile } from '../convert/convertModel';
import { EmitWriteError, OutputDirNotEmptyError, UnsafeForceTargetError } from './errors';
import { checkForceTarget } from './forceSafety';
import type { TranslatedClass } from '../translate/planTranslate';
import { planEmitDetailed } from './planEmit';
import type { EmittedFile, HandwrittenClass, TemplateFile } from './planEmit';

export interface EmitOptions {
  outputDir: string;
  force: boolean;
  swfPath: string; // only used for the force-safety check
  cwd: string;
  homeDir: string;
  templateDir: string;
  /** Emitted translated classes; the pipeline passes them from the translate stage (default none). */
  translated?: readonly TranslatedClass[];
  /** Override_Directory: its .ts files replace translated classes of the same name. */
  handwrittenDir: string | null;
  /** Injectable file writer (defaults to fs.writeFile, utf8). Used to test write failures. */
  writeFile?: (path: string, content: string) => Promise<void>;
}

export interface EmitResult {
  outputDir: string; // resolved absolute path
  files: string[]; // posix paths relative to outputDir, sorted
  warnings?: string[]; // e.g. overrides that were ignored
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

/** The highest ancestor of dir (or dir itself) that does not exist yet, or null if dir exists. */
async function topMissingDir(dir: string): Promise<string | null> {
  let top: string | null = null;
  for (let d = dir; ; d = dirname(d)) {
    try {
      await access(d);
      return top;
    } catch {
      top = d;
      if (dirname(d) === d) return top;
    }
  }
}

/**
 * Best-effort removal of what this run created: its files, then the directories it created
 * (deepest first, with rmdir so a directory that gained foreign content is left alone).
 */
async function cleanupRun(files: string[], createdTops: string[]): Promise<void> {
  const dirs = new Set<string>();
  for (const file of files) {
    await rm(file, { force: true }).catch(() => undefined);
    for (let d = dirname(file); ; d = dirname(d)) {
      const inside = createdTops.some((top) => d === top || d.startsWith(top + sep));
      if (!inside) break;
      dirs.add(d);
    }
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    await rmdir(d).catch(() => undefined);
  }
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
  const planned = planEmitDetailed(
    {
      scene: artifact.scene,
      sceneJson: serialiseScene(artifact.scene),
      templates: await loadTemplates(options.templateDir),
      translated: options.translated ?? [],
      handwritten: await loadHandwritten(options.handwrittenDir),
    },
    svgFiles,
  );
  const plan: EmittedFile[] = planned.files;

  if (options.force && existing !== null) {
    // fs.rm does not follow links: a link is removed, its target survives.
    for (const name of existing) {
      await rm(join(outputDir, name), { recursive: true, force: true });
    }
  }

  const write = options.writeFile ?? ((p: string, c: string) => writeFile(p, c, 'utf8'));
  const writtenFiles: string[] = [];
  const createdTops: string[] = []; // topmost directory each mkdir created in this run
  let failing = outputDir;
  try {
    for (const file of plan) {
      const target = join(outputDir, ...file.path.split('/'));
      failing = target;
      const top = await topMissingDir(dirname(target));
      if (top !== null) createdTops.push(top);
      await mkdir(dirname(target), { recursive: true });
      writtenFiles.push(target); // before the write: a failed write may leave a partial file
      await write(target, file.content);
    }
  } catch (err) {
    await cleanupRun(writtenFiles, createdTops);
    throw new EmitWriteError(failing, err);
  }
  return { outputDir, files: plan.map((f) => f.path), warnings: planned.warnings };
}
