// Pipeline glue: unpack -> convert -> emit, exit codes, progress output and the
// unsupported-features file. Stages and output are injected so tests need no Java.
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { ConvertedArtifact } from '../convert/writeConverted';
import type { EmitOptions, EmitResult } from '../emit/emit';
import type { UnpackInput, UnpackResult } from '../unpack/unpack';
import { PipelineError } from './errors';
import type { PipelineStage } from './errors';
import { serialiseUnsupported } from './unsupported';
import type { UnsupportedFeatureEntry } from './unsupported';

export interface PipelineStages {
  unpack(i: UnpackInput): Promise<UnpackResult>;
  convert(u: UnpackResult): Promise<ConvertedArtifact>;
  emit(a: ConvertedArtifact, o: EmitOptions): Promise<EmitResult>;
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

/** Linked classes (including the root) with no handwritten translation. */
function untranslatedClasses(artifact: ConvertedArtifact, handwritten: readonly string[]): UnsupportedFeatureEntry[] {
  const have = new Set(handwritten);
  const entries: UnsupportedFeatureEntry[] = [];
  for (const [key, sym] of Object.entries(artifact.scene.symbols)) {
    if (sym.type !== 'sprite' || sym.className === undefined || have.has(sym.className)) continue;
    entries.push({
      kind: 'untranslated-class',
      id: Number(key),
      message: `Class ${sym.className} has no handwritten translation; a plain MovieClip is used`,
    });
  }
  return entries;
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

  try {
    const unpacked = await stages.unpack({
      swfPath: resolve(args.swfPath),
      workDir,
      ffdecJarPath: args.ffdecJarPath,
    });
    io.out('[unpack] ok\n');

    stage = 'convert';
    artifact = await stages.convert(unpacked);
    unsupported = [...artifact.unsupported, ...untranslatedClasses(artifact, args.handwrittenClasses)];
    io.out(`[convert] ok (${artifact.stats.svgWritten} svg written, ${artifact.stats.morphSkipped} morph skipped)\n`);

    stage = 'emit';
    const result = await stages.emit(artifact, {
      outputDir: args.outputDir,
      force: args.force,
      swfPath: resolve(args.swfPath),
      cwd: args.cwd,
      homeDir: args.homeDir,
      templateDir: args.templateDir,
      handwrittenDir: args.handwrittenDir,
    });
    outputDir = result.outputDir;
    io.out('[emit] ok\n');
  } catch (err) {
    failure = err;
    exitCode = 1;
    const reported = err instanceof PipelineError ? err.stage : stage;
    io.err(`error [${reported}]: ${messageOf(err)}\n`);
  }

  // Unsupported list: after success, or after a failure once Convert completed (Req 9.6).
  if (artifact !== null) {
    const text = serialiseUnsupported(unsupported);
    if (failure !== null && isRefusal(failure)) {
      io.err(`unsupported features (not written, output directory left untouched):\n${text}`);
    } else {
      try {
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, 'unsupported-features.json'), text, 'utf8');
      } catch (err) {
        io.err(`error [pipeline]: cannot write unsupported-features.json: ${messageOf(err)}\n`);
        io.err(`unsupported features:\n${text}`);
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
