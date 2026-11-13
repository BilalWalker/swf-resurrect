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
import type { EmittedFile, HandwrittenClass, PlannedClass, TemplateFile } from './planEmit';
import { decideClassOmissions, looseClasses } from './classOmissions';
import type { BundlerCheckData, ClassOmission, ImportedName, LinkedSymbol, LooseClass, OmissionClass } from './classOmissions';
import type { ClassPathEntry } from './classPaths';
import { exportedNames } from './exportedNames';
import type { TranslationProblem } from '../translate/report';
import type { EvalRange, GateResult } from '../translate/typeCheckGate';
import { relativeSpecifier } from '../convert/qualifiedName';
import type { SceneJson } from '../../template/runtime/scene';

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
  /** Type-check gate over the planned project (posix path -> text). The Pipeline injects it; absent in most tests. */
  gate?: (files: ReadonlyMap<string, string>) => GateResult;
  /** Bundler_Guard over the planned class files (design 21.4). It rejects when Vite cannot run; Emit then falls back to the Requirement 23 rules. */
  bundlerGuard?: (files: ReadonlyMap<string, string>) => Promise<ReadonlyMap<string, BundlerCheckData>>;
}

export interface EmitResult {
  outputDir: string; // resolved absolute path
  files: string[]; // posix paths relative to outputDir, sorted
  warnings?: string[]; // e.g. overrides that were ignored
  /** Classes left out of src/classes.ts, one entry per class, sorted. */
  omissions: ClassOmission[];
  /** Registered translated classes with gate errors in their own file. */
  loose: LooseClass[];
  /** Chosen path of every emitted class file, sorted by className. */
  classPaths: ClassPathEntry[];
  /** Gate result for the project on disk; null when no gate was supplied. */
  gate: GateResult | null;
  /** `bundler-guard-unavailable` and `handwritten-override-unparsable` (Requirements 26.7, 26.13). */
  problems?: TranslationProblem[];
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

/** Walks the override directory; `a/b/Cls.ts` is the override of class `a.b.Cls`. */
async function loadHandwritten(dir: string | null, prefix = ''): Promise<HandwrittenClass[]> {
  if (dir === null) return [];
  const out: HandwrittenClass[] = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => byCodeUnit(a.name, b.name));
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await loadHandwritten(join(dir, entry.name), rel)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push({
        className: rel.replace(/\.ts$/, '').split('/').join('.'),
        fileName: rel,
        source: await readFile(join(dir, entry.name), 'utf8'),
      });
    }
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
  const planInput = {
    scene: artifact.scene,
    sceneJson: serialiseScene(artifact.scene),
    templates: await loadTemplates(options.templateDir),
    translated: options.translated ?? [],
    handwritten: await loadHandwritten(options.handwrittenDir),
  };
  const runGate = (files: readonly EmittedFile[]): GateResult | null =>
    options.gate === undefined ? null : options.gate(new Map(files.map((f) => [f.path, f.content])));

  // Gate first: plan with the full registry, check it, decide, and plan again only if a class cannot load.
  let planned = planEmitDetailed(planInput, svgFiles);
  let gate = runGate(planned.files);
  // The guard reads the planned final text (after the import lines are resolved), the text that is written.
  const problems: TranslationProblem[] = [];
  let checks: ReadonlyMap<string, BundlerCheckData> | undefined;
  if (options.bundlerGuard !== undefined) {
    const finalText = new Map(planned.files.map((f) => [f.path, f.content]));
    const classFiles = new Map<string, string>();
    for (const c of planned.classes) {
      const text = finalText.get(c.path);
      if (text !== undefined) classFiles.set(c.path, text);
    }
    try {
      checks = await options.bundlerGuard(classFiles);
    } catch (err) {
      problems.push({ kind: 'bundler-guard-unavailable', message: err instanceof Error ? err.message : String(err) });
    }
  }
  const omissionClasses = describeClasses(planned.classes, planInput.translated, planned.files, checks, gate?.moduleEval);
  const linked = linkedSymbols(artifact.scene);
  const gateErrors = gate?.errors ?? [];
  const omissions = decideClassOmissions(gateErrors, omissionClasses, linked);
  if (omissions.some((o) => o.reason.kind !== 'missing-source')) {
    planned = planEmitDetailed(planInput, svgFiles, new Set(omissions.map((o) => o.className)));
    gate = runGate(planned.files);
  }
  const loose = gate === null ? [] : looseClasses(gate.errors, omissionClasses, omissions);
  const overrideFile = new Map(planInput.handwritten.map((h) => [h.className, h.fileName]));
  const overrides = new Set(planned.classes.filter((c) => c.handwritten).map((c) => c.className));
  for (const o of omissions) {
    const r = o.reason;
    const fileName = overrideFile.get(o.className);
    if (r.kind !== 'bundler-parse' || fileName === undefined || !overrides.has(o.className)) continue;
    problems.push({ kind: 'handwritten-override-unparsable', path: fileName, message: r.message, line: r.line, column: r.column });
  }
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
  return { outputDir, files: plan.map((f) => f.path), warnings: planned.warnings, omissions, loose, classPaths: planned.classPaths, gate, problems };
}

function linkedSymbols(scene: SceneJson): LinkedSymbol[] {
  const out: LinkedSymbol[] = [];
  for (const key of Object.keys(scene.symbols)) {
    const symbol = scene.symbols[key];
    if (symbol.type === 'sprite' && symbol.className !== undefined) {
      out.push({ symbolId: Number(key), className: symbol.className });
    }
  }
  return out;
}

function describeClasses(
  classes: readonly PlannedClass[],
  translated: readonly TranslatedClass[],
  files: readonly EmittedFile[],
  checks?: ReadonlyMap<string, BundlerCheckData>,
  moduleEval?: Readonly<Record<string, readonly EvalRange[]>>,
): OmissionClass[] {
  const pathOf = new Map(classes.map((c) => [c.className, c.path]));
  const known = new Set(classes.map((c) => c.className));
  const text = new Map(files.map((f) => [f.path, f.content]));
  const byName = new Map(translated.map((t) => [t.className, t]));
  return classes.map((c) => {
    const t = c.handwritten ? undefined : byName.get(c.className);
    const imported = new Set<string>();
    const importedNames: ImportedName[] = [];
    const edges = new Map<string, string>();
    for (const r of t?.importRecords ?? []) {
      if (r.kind === 'class' && r.target !== undefined && r.target !== c.className && known.has(r.target)) {
        imported.add(r.target);
        const specifier = relativeSpecifier(c.path, pathOf.get(r.target) as string);
        edges.set(r.target, specifier);
        for (const n of r.names) importedNames.push({ target: r.target, name: n.name, line: r.line, specifier });
      }
    }
    const own = text.get(c.path);
    const bundler = checks?.get(c.path);
    const evalRanges = moduleEval?.[c.path];
    const names = own === undefined ? undefined : exportedNames(own);
    return {
      className: c.className,
      path: c.path,
      extendsQualified: t?.extendsQualified ?? null,
      importsQualified: [...imported].sort(byCodeUnit),
      importedNames,
      ...(names === undefined ? {} : { exports: names === null ? null : [...names].sort(byCodeUnit) }),
      handwritten: c.handwritten,
      produced: text.has(c.path),
      ...(evalRanges === undefined ? {} : { moduleEval: evalRanges }),
      ...(bundler === undefined ? {} : { bundler, importEdges: [...edges].map(([target, specifier]) => ({ target, specifier })) }),
    };
  });
}
