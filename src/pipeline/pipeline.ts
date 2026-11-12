// Pipeline glue: unpack -> convert -> translate -> emit -> typeCheck, exit codes, progress output and the
// unsupported-features file. Stages and output are injected so tests need no Java.
import { constants, existsSync } from 'node:fs';
import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { ConvertedArtifact } from '../convert/writeConverted';
import { omissionMessage } from '../emit/classOmissions';
import type { ClassOmission, LooseClass } from '../emit/classOmissions';
import type { EmitOptions, EmitResult } from '../emit/emit';
import type { UnpackInput, UnpackResult } from '../unpack/unpack';
import type { TranslateArtifact } from '../translate/planTranslate';
import { buildReport, classStatus, serialiseReport, untranslatedCodeEntries } from '../translate/report';
import type { TranslationReport } from '../translate/report';
import type { GateResult } from '../translate/typeCheckGate';
import type { VerifyRequest, VerifySummary } from '../verify/edge/verifyStage';
import { PipelineError } from './errors';
import type { PipelineStage } from './errors';
import { serialiseUnsupported } from './unsupported';
import type { UnsupportedFeatureEntry } from './unsupported';

export type { VerifyRequest, VerifySummary };

export interface PipelineStages {
  unpack(i: UnpackInput): Promise<UnpackResult>;
  convert(u: UnpackResult): Promise<ConvertedArtifact>;
  translate(u: UnpackResult, a: ConvertedArtifact): Promise<TranslateArtifact>;
  emit(a: ConvertedArtifact, o: EmitOptions): Promise<EmitResult>;
  typeCheck(outputDir: string, files: readonly string[]): Promise<GateResult>;
  /** In-memory gate injected into Emit (design 19.4). When set and Emit returns its result, 	ypeCheck does not run. */
  gate?(files: ReadonlyMap<string, string>): GateResult;
  verify?(req: VerifyRequest): Promise<VerifySummary>;
}

export interface PipelineIo {
  out(s: string): void;
  err(s: string): void;
}

export interface PipelineArgs {
  swfPath: string;
  outputDir: string;
  force: boolean;
  /** When set, used as the work directory and never deleted by the pipeline. */
  workDir?: string;
  keepWork: boolean;
  ffdecJarPath: string;
  templateDir: string;
  handwrittenDir: string | null;
  /** Class names that have a handwritten translation in handwrittenDir. */
  handwrittenClasses: readonly string[];
  cwd: string;
  homeDir: string;
  /** Set by --verify; frames is K from --verify-frames. */
  verify?: { frames?: number };
}

/** Error codes of the Emitter refusals that must leave the output directory untouched (Req 5.8, 5.10). */
const REFUSAL_CODES = new Set(['OUTPUT_DIR_NOT_EMPTY', 'UNSAFE_FORCE_TARGET']);

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRefusal(err: unknown): boolean {
  return err instanceof PipelineError && REFUSAL_CODES.has(err.code);
}

async function nearestExistingAncestor(path: string): Promise<string | null> {
  let current = resolve(path);
  for (;;) {
    try {
      await access(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

/** Returns an error message, or null when both paths look usable. Creates nothing. */
async function precheck(args: PipelineArgs): Promise<string | null> {
  try {
    await access(args.swfPath, constants.R_OK);
  } catch {
    return `SWF file is missing or not readable: ${args.swfPath}`;
  }
  const out = resolve(args.outputDir);
  const ancestor = await nearestExistingAncestor(out);
  if (ancestor === null) return `Output directory cannot be created: ${out}`;
  try {
    const s = await stat(ancestor);
    if (!s.isDirectory()) {
      return `Output path is not a directory: ${ancestor}`;
    }
    await access(ancestor, constants.W_OK);
  } catch {
    return `Output directory is not writable: ${out}`;
  }
  return null;
}

/** Linked classes (including the root) with neither a translated class nor an override. */
function untranslatedClasses(artifact: ConvertedArtifact, available: ReadonlySet<string>): UnsupportedFeatureEntry[] {
  const entries: UnsupportedFeatureEntry[] = [];
  for (const [key, sym] of Object.entries(artifact.scene.symbols)) {
    if (sym.type !== 'sprite' || sym.className === undefined || available.has(sym.className)) continue;
    entries.push({
      kind: 'untranslated-class',
      id: Number(key),
      message: `Class ${sym.className} has no translated class or override; a plain MovieClip is used`,
    });
  }
  return entries;
}

function reportOf(
  translated: TranslateArtifact | null,
  overridden: ReadonlySet<string>,
  gate: GateResult | null,
  omissions: readonly ClassOmission[] = [],
  loose: readonly LooseClass[] = [],
): TranslationReport {
  return buildReport(
    (translated?.classes ?? []).map((c) => ({
      className: c.className,
      overridden: overridden.has(c.className),
      diagnostics: c.diagnostics,
    })),
    gate,
    { omissions, loose },
  );
}

/** One class-omitted entry per omitted class, next to any untranslated-class entry (decision O7). */
function omissionEntries(omissions: readonly ClassOmission[]): UnsupportedFeatureEntry[] {
  return omissions.map((o) => ({ kind: 'class-omitted', tag: o.className, message: omissionMessage(o) }));
}

/** `src/Foo.ts (2), runtime/x.ts (1)`: error counts per file, sorted by file. */
function errorsPerFile(gate: GateResult): string {
  const counts = new Map<string, number>();
  for (const e of gate.errors) counts.set(e.file, (counts.get(e.file) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([file, n]) => `${file} (${n})`)
    .join(', ');
}

/** Runs the three stages. Exit codes: 0 success, 1 stage failure, 2 usage or path error. */
export async function runPipeline(args: PipelineArgs, stages: PipelineStages, io: PipelineIo): Promise<number> {
  const problem = await precheck(args);
  if (problem !== null) {
    io.err(`error [pipeline]: ${problem}\n`);
    return 2;
  }

  const ownsWorkDir = args.workDir === undefined;
  let workDir: string;
  try {
    if (args.workDir !== undefined) {
      workDir = resolve(args.workDir);
      await mkdir(workDir, { recursive: true });
    } else {
      workDir = await mkdtemp(join(tmpdir(), 'swf-resurrect-'));
    }
  } catch (err) {
    io.err(`error [pipeline]: cannot create work directory: ${messageOf(err)}\n`);
    return 2;
  }

  let stage: PipelineStage = 'unpack';
  let artifact: ConvertedArtifact | null = null;
  let unsupported: UnsupportedFeatureEntry[] = [];
  let exitCode = 0;
  let outputDir = resolve(args.outputDir);
  let failure: unknown = null;
  let translated: TranslateArtifact | null = null;
  let gate: GateResult | null = null;
  let omissions: ClassOmission[] = [];
  let loose: LooseClass[] = [];
  const overridden = new Set(args.handwrittenClasses);

  try {
    const unpacked = await stages.unpack({
      swfPath: resolve(args.swfPath),
      workDir,
      ffdecJarPath: args.ffdecJarPath,
    });
    io.out('[unpack] ok\n');

    stage = 'convert';
    artifact = await stages.convert(unpacked);
    unsupported = [...artifact.unsupported, ...untranslatedClasses(artifact, overridden)];
    io.out(`[convert] ok (${artifact.stats.svgWritten} svg written, ${artifact.stats.morphSkipped} morph skipped)\n`);

    stage = 'translate';
    translated = await stages.translate(unpacked, artifact);
    const available = new Set([...overridden, ...translated.classes.map((c) => c.className)]);
    unsupported = [
      ...artifact.unsupported,
      ...untranslatedCodeEntries(translated.classes, overridden),
      ...untranslatedClasses(artifact, available),
    ];
    const counts = { clean: 0, loose: 0, unsupported: 0 };
    for (const c of translated.classes) counts[classStatus(c.diagnostics, 0)]++;
    io.out(
      `[translate] ok (${translated.classes.length} classes: ${counts.clean} clean, ${counts.loose} loose, ${counts.unsupported} unsupported)\n`,
    );

    stage = 'emit';
    const result = await stages.emit(artifact, {
      outputDir: args.outputDir,
      force: args.force,
      swfPath: resolve(args.swfPath),
      cwd: args.cwd,
      homeDir: args.homeDir,
      templateDir: args.templateDir,
      handwrittenDir: args.handwrittenDir,
      translated: translated.classes,
      ...(stages.gate === undefined ? {} : { gate: stages.gate }),
    });
    outputDir = result.outputDir;
    io.out('[emit] ok\n');
    omissions = result.omissions;
    loose = result.loose;
    unsupported = [...unsupported, ...omissionEntries(omissions)];

    stage = 'pipeline';
    // The gate Emit ran describes the project on disk; run the separate stage only when Emit had none.
    gate = result.gate ?? (await stages.typeCheck(result.outputDir, result.files));
    if (gate.errors.length === 0) {
      io.out('[typecheck] ok (0 errors)\n');
    } else {
      io.err(`[typecheck] ${gate.errors.length} errors: ${errorsPerFile(gate)}\n`);
    }

    if (args.verify !== undefined && stages.verify !== undefined) {
      stage = 'verify';
      const swfDir = dirname(resolve(args.swfPath));
      const referenceDir = join(swfDir, 'reference');
      const req: VerifyRequest = {
        swfPath: resolve(args.swfPath),
        jarPath: args.ffdecJarPath,
        outputDir: result.outputDir,
        projectDir: result.outputDir,
        scene: artifact.scene,
        unsupported,
        translationReport: reportOf(translated, overridden, gate, omissions, loose),
        sampleName: basename(swfDir),
        referenceDir: existsSync(referenceDir) ? referenceDir : null,
      };
      if (args.verify.frames !== undefined) req.frames = args.verify.frames;
      const summary = await stages.verify(req);
      const pct = (v: number | null): string => (v === null ? 'not-compared' : `${v.toFixed(2)}%`);
      io.out(
        `[verify] overall match ${pct(summary.overallMatch)}, trace score ${pct(summary.traceScore)} -> ${summary.jsonPath}, ${summary.htmlPath}\n`,
      );
    }
  } catch (err) {
    failure = err;
    exitCode = 1;
    const reported = err instanceof PipelineError ? err.stage : stage;
    io.err(`error [${reported}]: ${messageOf(err)}\n`);
  }

  // Unsupported list: after success, or after a failure once Convert completed (Req 9.6).
  if (artifact !== null) {
    const files = [
      { name: 'unsupported-features.json', label: 'unsupported features', text: serialiseUnsupported(unsupported) },
      {
        name: 'translation-report.json',
        label: 'translation report',
        text: serialiseReport(reportOf(translated, overridden, gate, omissions, loose)),
      },
    ];
    for (const f of files) {
      if (failure !== null && isRefusal(failure)) {
        io.err(`${f.label} (not written, output directory left untouched):\n${f.text}`);
        continue;
      }
      try {
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, f.name), f.text, 'utf8');
      } catch (err) {
        io.err(`error [pipeline]: cannot write ${f.name}: ${messageOf(err)}\n`);
        io.err(`${f.label}:\n${f.text}`);
        if (exitCode === 0) exitCode = 1;
      }
    }
  }

  if (ownsWorkDir && !args.keepWork) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (exitCode === 0) io.out(`Done: ${outputDir}\n`);
  return exitCode;
}
