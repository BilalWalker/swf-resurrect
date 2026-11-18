// Pipeline glue: unpack -> convert -> translate -> emit -> typeCheck, exit codes, progress output and the
// unsupported-features file. Stages and output are injected so tests need no Java.
import { constants, existsSync } from 'node:fs';
import { access, mkdir, mkdtemp, open, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { basename, dirname, join, resolve } from 'node:path';
import type { ConvertedArtifact } from '../convert/writeConverted';
import { omissionMessage } from '../emit/classOmissions';
import type { BundlerCheckData, ClassOmission, LooseClass } from '../emit/classOmissions';
import type { ClassPathEntry } from '../emit/classPaths';
import type { EmitOptions, EmitResult } from '../emit/emit';
import type { UnpackInput, UnpackResult } from '../unpack/unpack';
import { readFacts } from '../facts/readFacts';
import { classifyError } from '../outcome/classifyError';
import { summariseGaps } from '../outcome/gaps';
import { decideOutcome } from '../outcome/outcome';
import type { ClassifiedFailure, Facts, Outcome, OutcomeLimits, OutcomeNumbers, OutcomeRecord, ReasonCode, StageRecord } from '../outcome/outcome';
import { writeOutcomeFile } from '../outcome/outcomeFile';
import { reasonSentence } from '../outcome/reasons';
import { failedReason, referenceIdFromDigest, referenceIdInput } from '../outcome/referenceId';
import { childNamesByClass } from '../translate/planTranslate';
import type { TranslateArtifact } from '../translate/planTranslate';
import { buildReport, classStatus, serialiseReport, untranslatedCodeEntries } from '../translate/report';
import type { TranslationProblem, TranslationReport } from '../translate/report';
import type { GateResult } from '../translate/typeCheckGate';
import type { VerifyRequest, VerifySummary } from '../verify/edge/verifyStage';
import { PipelineError } from './errors';
import { killAll } from './processTree';
import { planCleanup } from './cleanup';
import type { CleanupPlan } from './cleanup';
import { createGuard, RunAbortedError } from './guard';
import type { Clock, RunGuard } from './guard';
import { defaultLimits, stageAllowanceS } from './limits';
import { realClock } from './realClock';
import type { PipelineStage } from './errors';
import { classifyOverrides } from './handwrittenSet';
import type { HandwrittenEntry, HandwrittenReportEntry } from './handwrittenSet';
import { serialiseUnsupported } from './unsupported';
import type { UnsupportedFeatureEntry } from './unsupported';

export type { VerifyRequest, VerifySummary };

/**
 * Counts of the Translation_Report (D-A3). Amended at Task 12.3, owner decision, condition 1: a Candidate_Class is translated when
 * Emit registered it (not omitted) AND its emitted file parses (not the D5 fallback, `parseFailed`) and it is clean, loose, an applied override, or kept
 * with untranslated code (status `unsupported`, not loose). An omitted class (missing-source, syntax-error,
 * bundler-parse or any other omission) never counts, so a run whose candidates are all omitted has translatedClasses 0
 * and is refused `nothing-translated`.
 *
 * clean + loose + untranslatedCode + unparsed + (omitted candidates) = candidates; omittedClasses also counts an omitted linked class
 * that is no candidate; translatedClasses = clean + loose + untranslatedCode.
 */
export function numbersOf(report: TranslationReport, droppedPlacements: number): OutcomeNumbers {
  const unparsed = report.classes.filter((c) => !c.omitted && c.parseFailed === true);
  const kept = report.classes.filter((c) => !c.omitted && c.parseFailed !== true);
  const untranslatedCode = kept.filter((c) => c.status === 'unsupported' && !c.loose);
  const cleanClasses = kept.filter((c) => c.status === 'clean' && !c.loose).length;
  const looseClasses = kept.filter((c) => c.status === 'loose' || c.loose).length;
  return {
    candidateClasses: report.classes.length,
    translatedClasses: cleanClasses + looseClasses + untranslatedCode.length,
    cleanClasses,
    looseClasses,
    untranslatedCodeClasses: untranslatedCode.length,
    unparsedClasses: unparsed.length,
    unsupportedClasses: report.classes.filter((c) => c.status === 'unsupported').length,
    omittedClasses: report.omittedClasses.length,
    typeErrors: report.classes.reduce((n, c) => n + c.typeErrors.length, 0) + report.otherErrors.length,
    droppedPlacements,
    namedLimits: 0,
  };
}
/** A refusal found by the Facts stage; no FFDec process has started. */
class FactsRefusedError extends Error {
  constructor(readonly reasonCode: ReasonCode) {
    super(`input refused: ${reasonCode}`);
  }
}

/** Edge wrapper of zlib for the Facts_Reader. */
function nodeInflate(data: Uint8Array, maxOutputLength: number): Uint8Array {
  return new Uint8Array(inflateSync(data, { maxOutputLength: Math.max(1, maxOutputLength) }));
}

/** Reads the file and the Facts. A too-large file is judged from its size and 8 header bytes, never read whole. */
async function factsStage(swfPath: string, maxInputBytes: number): Promise<{ facts: Facts | null; refusal: ReasonCode | null }> {
  const size = (await stat(swfPath)).size;
  let bytes: Uint8Array;
  if (size > maxInputBytes) {
    const fh = await open(swfPath, 'r');
    try {
      const buf = new Uint8Array(8);
      const { bytesRead } = await fh.read(buf, 0, 8, 0);
      bytes = buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
    const r = readFacts(bytes, { maxSizeBytes: bytes.length - 1 }, nodeInflate);
    if (r.ok) return { facts: null, refusal: 'too-large' };
    if (r.facts !== null) r.facts.sizeBytes = size;
    return { facts: r.facts, refusal: r.reasonCode };
  }
  bytes = new Uint8Array(await readFile(swfPath));
  const r = readFacts(bytes, { maxSizeBytes: maxInputBytes }, nodeInflate);
  return r.ok ? { facts: r.facts, refusal: null } : { facts: r.facts, refusal: r.reasonCode };
}

/** Number of `.as` files FFDec exported under scripts/; null when the directory is unknown or unreadable. */
async function countAbcClasses(scriptsDir: unknown): Promise<number | null> {
  if (typeof scriptsDir !== 'string') return null;
  try {
    return (await readdir(scriptsDir, { recursive: true })).filter((n) => n.endsWith('.as')).length;
  } catch {
    return null;
  }
}
/** The Outcome_Line: `Outcome: <outcome> <reasonCode or -> <reason>` (Requirement 2.5). */
export function outcomeLine(o: Outcome): string {
  return `Outcome: ${o.outcome} ${o.reasonCode ?? '-'} ${o.reason}`;
}

export interface PipelineStages {
  unpack(i: UnpackInput): Promise<UnpackResult>;
  convert(u: UnpackResult): Promise<ConvertedArtifact>;
  translate(
    u: UnpackResult,
    a: ConvertedArtifact,
    childNames?: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<TranslateArtifact>;
  emit(a: ConvertedArtifact, o: EmitOptions): Promise<EmitResult>;
  typeCheck(outputDir: string, files: readonly string[]): Promise<GateResult>;
  /** In-memory gate injected into Emit (design 19.4). When set and Emit returns its result, 	ypeCheck does not run. */
  gate?(files: ReadonlyMap<string, string>): GateResult;
  /** Bundler_Guard injected into Emit (design 21.4); it rejects when Vite cannot run. */
  guard?(files: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, BundlerCheckData>>;
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
  /** The Handwritten_Set (handwritten/SET.json); absent means empty, so every applied override is reported as not in the set. */
  handwrittenSet?: readonly HandwrittenEntry[];
  cwd: string;
  homeDir: string;
  /** Set by --verify; frames is K from --verify-frames. */
  verify?: { frames?: number };
  /** Set by --reference-dir; null or absent means <swf dir>/reference when it exists. */
  referenceDir?: string | null;
  /** Run_Limits from resolveLimits; absent means the defaults. */
  limits?: OutcomeLimits;
  /** Clock of the run guard; absent means the real clock. Tests pass a fake. */
  clock?: Clock;
  /** Called once with the run guard as soon as it exists, so a signal handler can call `guard.abort`. */
  onGuard?: (guard: RunGuard) => void;
}

/** Error codes of the Emitter refusals that must leave the output directory untouched (Req 5.8, 5.10). */
const REFUSAL_CODES = new Set(['OUTPUT_DIR_NOT_EMPTY', 'UNSAFE_FORCE_TARGET']);

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'a value that cannot be printed was thrown'; // e.g. an object without a prototype
  }
}

function isRefusal(err: unknown): boolean {
  return err instanceof PipelineError && REFUSAL_CODES.has(err.code);
}

/** Hash of the input file at the edge; an unreadable file gives an empty string, so the id is still derived. */
async function inputSha256(swfPath: string): Promise<string> {
  try {
    return createHash('sha256').update(await readFile(swfPath)).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Derives the Reference_Id (D-A6) and writes the log of a caught error into the output directory: the stack to
 * `failure-<id>.log`, or for an FFDec exit at Unpack the FFDec text to `ffdec-<id>.log` (error name FfdecExitError).
 * Never throws; a log that cannot be written is skipped.
 */
async function writeFailureLogs(err: unknown, stage: string, ffdecExit: boolean, swfPath: string, outputDir: string): Promise<string> {
  const name = ffdecExit ? 'FfdecExitError' : err instanceof Error ? err.name : 'NonError';
  const message = messageOf(err);
  const digest = createHash('sha256').update(referenceIdInput(await inputSha256(swfPath), stage, name, message)).digest('hex');
  const id = referenceIdFromDigest(digest);
  const text = ffdecExit
    ? `${message}\n`
    : `${err instanceof Error && err.stack !== undefined ? err.stack : `${name}: ${message}`}\n`;
  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, `${ffdecExit ? 'ffdec' : 'failure'}-${id}.log`), text, 'utf8');
  } catch {
    // The Outcome_Line still carries the id.
  }
  return id;
}

/** Files and directories under dir as posix paths relative to dir; empty when dir does not exist or cannot be read. */
async function listOutputDir(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { recursive: true })).map((p) => p.split('\\').join('/'));
  } catch {
    return [];
  }
}

/** Deletes the planned files, then the directories the run created that are now empty (rmdir never removes content). */
async function removePlanned(dir: string, plan: CleanupPlan): Promise<void> {
  for (const f of plan.files) await rm(join(dir, ...f.split('/')), { force: true }).catch(() => undefined);
  for (const d of plan.directories) await rmdir(join(dir, ...d.split('/'))).catch(() => undefined);
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
  classPaths: readonly ClassPathEntry[] = [],
  problems: readonly TranslationProblem[] = [],
  handwritten: readonly HandwrittenReportEntry[] = [],
): TranslationReport {
  const pathOf = new Map(classPaths.map((p) => [p.className, p.path]));
  return buildReport(
    (translated?.classes ?? []).map((c) => ({
      className: c.className,
      overridden: overridden.has(c.className),
      ...(pathOf.has(c.className) ? { path: pathOf.get(c.className) as string } : {}),
      diagnostics: c.diagnostics,
      ...(c.parseFailed === true ? { parseFailed: true as const } : {}),
    })),
    gate,
    {
      omissions, loose, classPaths, handwritten,
      problems: [...problems, ...(translated?.importCycles ?? []).map((c) => importCycleProblem(c.className, c.path))],
      importCuts: (translated?.classes ?? []).flatMap((c) => (c.cutSites ?? []).map((s) => ({ className: c.className, target: s.target, line: s.line }))),
    },
  );
}

/** The Translation_Report problem for an import cycle that has no cuttable import (Requirement 37.5). */
function importCycleProblem(className: string, path: readonly string[]): TranslationProblem {
  return { kind: 'import-cycle', message: `${className} extends ${path[0]}, which reaches it through value imports: ${path.join(' -> ')} -> ${className}`, path: className };
}

/** The CLI line for an omitted handwritten override (Requirement 26.13, D40). */
function overrideWarning(p: TranslationProblem): string {
  return `warn [emit]: handwritten override ${p.path ?? ''} does not parse with Vite and is left out of the registry: ${p.message} (line ${p.line ?? 0}, column ${p.column ?? 0})\n`;
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

/** The `[verify]` line, then (Trace_Score below 100) the missing and extra counts and one line per input note. */
export function verifyLines(summary: VerifySummary): string[] {
  const pct = (v: number | null): string => (v === null ? 'not-compared' : `${v.toFixed(2)}%`);
  const lines = [
    `[verify] overall match ${pct(summary.overallMatch)}, trace score ${pct(summary.traceScore)} -> ${summary.jsonPath}, ${summary.htmlPath}`,
  ];
  if (summary.traceScore !== null && summary.traceScore < 100) {
    lines.push(`  trace: ${summary.missing} missing, ${summary.extra} extra`);
    for (const n of summary.inputNoteLines) lines.push(`  input note: ${n}`);
  }
  return lines;
}

/** Runs the three stages. Exit codes: 0 success, 1 stage failure, 2 usage or path error. */
export async function runPipeline(args: PipelineArgs, stages: PipelineStages, io: PipelineIo): Promise<number> {
  const runLimits = args.limits ?? defaultLimits();
  const problem = await precheck(args);
  if (problem !== null) {
    io.err(`error [pipeline]: ${problem}\n`);
    return 2;
  }

  // Listing of the output directory after the precheck and before the first write (cleanup plan input).
  const preExisting = await listOutputDir(resolve(args.outputDir));
  const journal: string[] = []; // every path Emit reports through onWrite, kept even when Emit throws
  let emittedFiles: readonly string[] = [];

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
  // The run starts here: the wait for a PIPELINE_SLOTS slot is test-side and never reaches this clock.
  const guard = createGuard({ clock: args.clock ?? realClock, limits: runLimits, killAll });
  args.onGuard?.(guard);
  const stageRecords: StageRecord[] = guard.records;
  let translated: TranslateArtifact | null = null;
  let gate: GateResult | null = null;
  let omissions: ClassOmission[] = [];
  let loose: LooseClass[] = [];
  let classPaths: ClassPathEntry[] = [];
  let problems: TranslationProblem[] = [];
  let handwritten: HandwrittenReportEntry[] = [];
  const overridden = new Set(args.handwrittenClasses);
  let facts: Facts | null = null;
  let classified: ClassifiedFailure | null = null;
  let referenceId: string | null = null;

  try {
    // Facts stage: no FFDec process starts for a refused input.
    const read = await factsStage(resolve(args.swfPath), runLimits.maxSizeMiB * 1024 * 1024);
    facts = read.facts;
    if (read.refusal !== null) throw new FactsRefusedError(read.refusal);
    const unpacked = await guard.runStage('unpack', () =>
      stages.unpack({
        swfPath: resolve(args.swfPath),
        workDir,
        ffdecJarPath: args.ffdecJarPath,
        allowanceMs: stageAllowanceS(guard.limits, 'unpack') * 1000,
        allowanceLabel: ` s stage limit`,
      }),
    );
    if (facts !== null) {
      facts.abcClassCount = await countAbcClasses((unpacked as Partial<UnpackResult>).scriptsDir);
      if (facts.abcClassCount !== null) facts.source.ffdec = ['abcClassCount'];
    }
    io.out('[unpack] ok\n');

    stage = 'convert';
    artifact = await guard.runStage('convert', () => stages.convert(unpacked));
    unsupported = [...artifact.unsupported, ...untranslatedClasses(artifact, overridden)];
    io.out(`[convert] ok (${artifact.stats.svgWritten} svg written, ${artifact.stats.morphSkipped} morph skipped)\n`);

    stage = 'translate';
    const convertedArtifact = artifact;
    translated = await guard.runStage('translate', () => stages.translate(unpacked, convertedArtifact, childNamesByClass(convertedArtifact.scene)));
    const available = new Set([...overridden, ...translated.classes.map((c) => c.className)]);
    unsupported = [
      ...artifact.unsupported,
      ...untranslatedCodeEntries(translated.classes, overridden),
      ...untranslatedClasses(artifact, available),
    ];
    const counts = { clean: 0, loose: 0, unsupported: 0 };
    for (const c of translated.classes) counts[classStatus(c.diagnostics, 0)]++;
    io.out(
      `[translate] ok (${translated.classes.length} classes: ${counts.clean} clean, ${counts.loose} loose, ${counts.unsupported} unsupported)\n` +
        `  counts taken before the type check; final counts are in translation-report.json\n`,
    );

    stage = 'emit';
    const translatedClasses = translated.classes;
    const result = await guard.runStage('emit', () => stages.emit(convertedArtifact, {
      outputDir: args.outputDir,
      force: args.force,
      swfPath: resolve(args.swfPath),
      cwd: args.cwd,
      homeDir: args.homeDir,
      templateDir: args.templateDir,
      handwrittenDir: args.handwrittenDir,
      translated: translatedClasses,
      onWrite: (p: string) => { journal.push(p); },
      ...(stages.gate === undefined ? {} : { gate: stages.gate }),
      ...(stages.guard === undefined ? {} : { bundlerGuard: stages.guard }),
    }));
    outputDir = result.outputDir;
    emittedFiles = result.files;
    io.out('[emit] ok\n');
    omissions = result.omissions;
    loose = result.loose;
    classPaths = result.classPaths;
    problems = result.problems ?? [];
    for (const p of problems) {
      if (p.kind === 'handwritten-override-unparsable') io.err(overrideWarning(p));
      else io.err(`warn [emit]: the bundler guard could not run, class files are not checked with Vite: ${p.message}\n`);
    }
    // Applied overrides: in the set they are listed with their reason, outside it they are a problem (Requirement 33.3 to 33.5).
    const sorted = classifyOverrides(
      basename(dirname(resolve(args.swfPath))),
      result.overrides ?? [],
      args.handwrittenSet ?? [],
      new Set(translated.classes.map((c) => c.className)),
    );
    handwritten = sorted.listed;
    for (const className of sorted.unlisted) {
      const message = `${className} is a hand-written class that is not in handwritten/SET.json`;
      problems = [...problems, { kind: 'handwritten-not-in-set', path: className, message }];
      io.err(`warn [emit]: ${message}\n`);
    }
    unsupported = [...unsupported, ...omissionEntries(omissions)];

    stage = 'pipeline';
    // The gate Emit ran describes the project on disk; run the separate stage only when Emit had none.
    const emitted = result;
    gate = await guard.runStage('gate', async () => emitted.gate ?? (await stages.typeCheck(emitted.outputDir, emitted.files)));
    if (gate.errors.length === 0) {
      io.out('[typecheck] ok (0 errors)\n');
    } else {
      io.err(`[typecheck] ${gate.errors.length} errors: ${errorsPerFile(gate)}\n`);
    }

    if (args.verify !== undefined && stages.verify !== undefined) {
      stage = 'verify';
      const swfDir = dirname(resolve(args.swfPath));
      const defaultReferenceDir = join(swfDir, 'reference');
      const referenceDir = args.referenceDir == null ? defaultReferenceDir : resolve(args.referenceDir);
      const req: VerifyRequest = {
        swfPath: resolve(args.swfPath),
        jarPath: args.ffdecJarPath,
        outputDir: result.outputDir,
        projectDir: result.outputDir,
        scene: artifact.scene,
        unsupported,
        translationReport: reportOf(translated, overridden, gate, omissions, loose, classPaths, problems, handwritten),
        sampleName: basename(swfDir),
        referenceDir: args.referenceDir == null && !existsSync(referenceDir) ? null : referenceDir,
      };
      if (args.verify.frames !== undefined) req.frames = args.verify.frames;
      const verifyStage = stages.verify;
      const summary = await guard.runStage('verify', () => verifyStage(req));
      for (const line of verifyLines(summary)) io.out(`${line}\n`);
    }
  } catch (err) {
    // `throw null` and `throw undefined` must still count as a failure.
    failure = err ?? new Error('null or undefined was thrown');
    const reported = err instanceof PipelineError ? err.stage : stage;
    if (isRefusal(err)) {
      // D-A9: an Emit refusal is a path error, outside the Outcome set.
      exitCode = 2;
      io.err(`error [pipeline]: ${messageOf(err)}\n`);
    } else {
      exitCode = 1;
      if (err instanceof FactsRefusedError) {
        io.err(`error [${reported}]: ${messageOf(err)}\n`);
      } else {
        classified = classifyError(failure, reported);
        const isFfdecExit = classified.kind === 'refused' && classified.reasonCode === 'damaged' && (err as { code?: unknown } | null)?.code === 'FFDEC_EXIT';
        if (err instanceof RunAbortedError) {
          // A stop by signal is not a defect: no failure log and no Reference_Id.
          io.err('error [pipeline]: run stopped by signal\n');
        } else if (classified.kind === 'internal' || isFfdecExit) {
          const id = await writeFailureLogs(failure, reported, isFfdecExit, resolve(args.swfPath), outputDir);
          if (classified.kind === 'internal') {
            referenceId = id;
            io.err(`error [pipeline]: internal error, reference ${id}\n`);
          } else {
            io.err(`error [${reported}]: ${reasonSentence('damaged')}\n`);
          }
        } else {
          io.err(`error [${reported}]: ${messageOf(err)}\n`);
        }
      }
    }
  }

  const finalReport =
    artifact === null
      ? null
      : reportOf(translated, overridden, gate, omissions, loose, classPaths, problems, handwritten);

  // Unsupported list: after success, or after a failure once Convert completed (Req 9.6).
  let writeFailed = false;
  if (artifact !== null && finalReport !== null) {
    const files = [
      { name: 'unsupported-features.json', label: 'unsupported features', text: serialiseUnsupported(unsupported) },
      { name: 'translation-report.json', label: 'translation report', text: serialiseReport(finalReport) },
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
        writeFailed = true;
      }
    }
  }

  if (ownsWorkDir && !args.keepWork) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  if (failure !== null && isRefusal(failure)) return 2;

  // One decision per run (D-A1).
  if (failure instanceof FactsRefusedError) {
    classified = { kind: 'refused', reasonCode: failure.reasonCode };
  } else if (failure === null && writeFailed) {
    classified = { kind: 'internal', reasonCode: 'internal-error', stage: 'pipeline' };
    referenceId = await writeFailureLogs(new Error('cannot write output files'), 'pipeline', false, resolve(args.swfPath), outputDir);
  }
  if (classified !== null && classified.kind === 'internal' && referenceId !== null) {
    classified = { ...classified, reason: failedReason(classified.reason ?? reasonSentence('internal-error'), referenceId) };
  }
  const ranToGate = failure === null && finalReport !== null && gate !== null;
  const gaps = ranToGate ? summariseGaps(unsupported, {
        typeErrors: numbersOf(finalReport, 0).typeErrors,
        droppedPlacements: artifact?.stats.placementsDropped ?? 0,
      }) : [];
  const numbers = ranToGate ? numbersOf(finalReport, artifact?.stats.placementsDropped ?? 0) : null;
  const decision = decideOutcome({
    facts,
    stages: stageRecords,
    failure: classified,
    numbers,
    gaps,
    limits: runLimits,
    recovery: null,
  });

  const record: OutcomeRecord = {
    formatVersion: 1,
    outcome: decision.outcome,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    facts,
    numbers,
    gaps,
    limits: runLimits,
    stages: stageRecords,
    obfuscated: null,
    recovery: null,
    referenceId: decision.outcome === 'failed' ? referenceId : null,
  };
  if (decision.outcome === 'refused' || decision.outcome === 'failed') {
    // Requirement 9: remove only what this run wrote. The Emit refusals returned above and never reach here.
    await removePlanned(
      outputDir,
      planCleanup({ preExisting, writtenByRun: [...journal, ...emittedFiles], keep: [] }),
    );
  }
  await mkdir(outputDir, { recursive: true }).catch(() => undefined);
  await writeOutcomeFile(
    outputDir,
    record,
    { writeFile: (p, text) => writeFile(p, text, 'utf8'), rename, remove: (p) => rm(p, { force: true }) },
    process.pid,
  );

  const isProject = decision.outcome === 'converted' || decision.outcome === 'converted-with-gaps';
  if (isProject) io.out(`Done: ${outputDir}\n`);
  io.out(`${outcomeLine(decision)}\n`);
  return decision.exitCode;
}
