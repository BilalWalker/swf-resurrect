// Verify_Stage (verify design: "Verify_Stage sequence", sections 9 and 11).
// Every failure of FFDec, the browser or the Replay is a recorded Problem; only a failed write throws.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SceneJson } from '../../../template/runtime/scene';
import type { UnsupportedFeatureEntry } from '../../pipeline/unsupported';
import type { TranslationReport } from '../../translate/report';
import { KNOWN_BEHAVIOUR_GAPS } from '../core/constants';
import { selectFrames } from '../core/frameSample';
import { buildInputNotes, formatInputNotes } from '../core/inputNotes';
import { knownVisualLimits } from '../core/limits';
import { buildDiffImage, compareImages, flattenOnto } from '../core/pixelDiff';
import type { Rgb, RgbaImage } from '../core/pixelDiff';
import { planReplay, parseNumFrames, parseTickOptions } from '../core/replayPlan';
import type { ReplayPlan } from '../core/replayPlan';
import { buildFidelityReport, serialiseFidelityReport } from '../core/report';
import type { BehaviourInput, FrameOutcome, Problem, ReplayInputSource } from '../core/report';
import { renderFidelityHtml } from '../core/html';
import { sanitizeDetail } from '../core/sanitize';
import { decideBehaviour } from '../core/replayOutcome';
import { splitTraceLines } from '../core/traceFormat';
import { buildProject as realBuildProject } from './buildProject';
import type { BuiltProject } from './buildProject';
import { exportReferenceFrames as realExportReferenceFrames } from './ffdecFrames';
import type { ExportReferenceFramesInput, ReferenceFrame } from './ffdecFrames';
import { encodePng } from './png';
import { renderFrames as realRenderFrames } from './renderFrames';
import type { RenderedFrame } from './renderFrames';
import { replay as realReplay } from './replay';
import type { ReplayResult } from './replay';
import { FFDEC_VERSION, PLAYWRIGHT_VERSION, PNGJS_VERSION } from './versions';

/** The edges the stage calls; tests inject stubs. */
export interface VerifyDeps {
  exportReferenceFrames(input: ExportReferenceFramesInput): Promise<Map<number, ReferenceFrame>>;
  buildProject(projectDir: string): Promise<BuiltProject>;
  renderFrames(
    distDir: string,
    frames: readonly number[],
    stage: { width: number; height: number },
  ): Promise<Map<number, RenderedFrame>>;
  replay(projectDir: string, plan: ReplayPlan): Promise<ReplayResult>;
}

export interface VerifyRequest {
  swfPath: string;
  /** FFDec jar. */
  jarPath: string;
  /** Where translation-report.json sits; fidelity-report.* and verify/ are written here. */
  outputDir: string;
  /** The Emitted_Project (normally the same directory as outputDir). */
  projectDir: string;
  scene: SceneJson;
  unsupported: readonly UnsupportedFeatureEntry[];
  translationReport: TranslationReport;
  sampleName: string;
  /** `<sample>/reference`, or null when the sample has none. Read only, never written. */
  referenceDir: string | null;
  /** K from --verify-frames. */
  frames?: number;
  deps?: Partial<VerifyDeps>;
}

export interface VerifySummary {
  overallMatch: number | null;
  traceScore: number | null;
  /** Counts and note lines for the CLI; zero and empty when the behaviour was not compared. */
  missing: number;
  extra: number;
  inputNoteLines: string[];
  jsonPath: string;
  htmlPath: string;
}

const REAL_DEPS: VerifyDeps = {
  exportReferenceFrames: realExportReferenceFrames,
  buildProject: realBuildProject,
  renderFrames: realRenderFrames,
  replay: realReplay,
};

function describe(err: unknown): string {
  return sanitizeDetail(err instanceof Error ? err.message : String(err));
}

function parseBackground(hex: string): Rgb {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (m === null) return [255, 255, 255];
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

async function readOptional(path: string | null): Promise<string | null> {
  if (path === null) return null;
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function isImage(v: unknown): v is RgbaImage {
  return typeof v === 'object' && v !== null && 'data' in v && 'width' in v;
}

function hasKey<K extends string>(v: unknown, key: K): v is Record<K, never> {
  return typeof v === 'object' && v !== null && key in v;
}

function framePath(dir: string, frame: number, suffix: string): string {
  return join(dir, `${String(frame).padStart(4, '0')}-${suffix}.png`);
}

function sizeText(s: { width: number; height: number }): string {
  return `${s.width}x${s.height}`;
}

export async function verifyStage(req: VerifyRequest): Promise<VerifySummary> {
  const deps: VerifyDeps = { ...REAL_DEPS, ...req.deps };
  const stage = { width: req.scene.stage.width, height: req.scene.stage.height };
  const background = req.scene.stage.backgroundColor;
  const bg = parseBackground(background);
  const root = req.scene.symbols[String(req.scene.rootSymbolId)];
  const frameCount = root !== undefined && root.type === 'sprite' ? root.frameCount : 1;
  const sample = selectFrames(frameCount, req.frames);
  const outputDir = resolve(req.outputDir);
  const framesDir = join(outputDir, 'verify', 'frames');

  const problems: Problem[] = [];
  const outcomes = new Map<number, FrameOutcome>();
  const notCompared = (
    frame: number,
    reason: 'reference-unavailable' | 'size-mismatch' | 'render-failed',
    detail: string,
  ): void => {
    outcomes.set(frame, { frame, status: 'not-compared', reason });
    problems.push({ kind: reason, frame, detail: sanitizeDetail(detail) });
  };

  // 1. Reference frames (FFDec).
  let references = new Map<number, ReferenceFrame>();
  const ffdecDir = await mkdtemp(join(tmpdir(), 'swf-verify-ref-'));
  try {
    try {
      references = await deps.exportReferenceFrames({
        swfPath: resolve(req.swfPath),
        jarPath: req.jarPath,
        frames: sample,
        workDir: ffdecDir,
        stage,
      });
    } catch (err) {
      const detail = describe(err);
      references = new Map(sample.map((n) => [n, { missing: detail }]));
    }

    const usable = new Map<number, RgbaImage>();
    for (const n of sample) {
      const ref = references.get(n);
      if (ref !== undefined && isImage(ref)) usable.set(n, ref);
      else if (ref !== undefined && hasKey(ref, 'sizeMismatch')) {
        const s = (ref as unknown as { sizeMismatch: { width: number; height: number } }).sizeMismatch;
        notCompared(n, 'size-mismatch', `reference is ${sizeText(s)}, stage is ${sizeText(stage)}`);
      } else {
        const why = ref !== undefined && hasKey(ref, 'missing') ? String((ref as unknown as { missing: string }).missing) : 'no reference frame was produced';
        notCompared(n, 'reference-unavailable', why);
      }
    }

    // 2. Rendered frames (Vite build + headless Chromium), only for frames with a usable reference.
    const toRender = [...usable.keys()];
    let rendered = new Map<number, RenderedFrame>();
    if (toRender.length > 0) {
      let built: BuiltProject | null = null;
      try {
        built = await deps.buildProject(resolve(req.projectDir));
        rendered = await deps.renderFrames(built.distDir, toRender, stage);
      } catch (err) {
        const detail = describe(err);
        rendered = new Map(toRender.map((n) => [n, { renderFailed: detail }]));
      } finally {
        if (built !== null) await built.dispose().catch(() => undefined);
      }
    }

    // 3. Compare and write images.
    for (const n of toRender) {
      const ref = usable.get(n)!;
      const img = rendered.get(n);
      if (img === undefined || !isImage(img)) {
        const why = img !== undefined && hasKey(img, 'renderFailed') ? String((img as unknown as { renderFailed: string }).renderFailed) : 'no image was produced';
        notCompared(n, 'render-failed', why);
        continue;
      }
      const diff = compareImages(ref, img, bg);
      if (!diff.ok) {
        notCompared(n, 'size-mismatch', `reference is ${sizeText(diff.error.a)}, rendered is ${sizeText(diff.error.b)}`);
        continue;
      }
      const v = diff.value;
      await mkdir(framesDir, { recursive: true });
      await writeFile(framePath(framesDir, n, 'reference'), encodePng(ref));
      await writeFile(framePath(framesDir, n, 'rendered'), encodePng(img));
      await writeFile(framePath(framesDir, n, 'diff'), encodePng(buildDiffImage(flattenOnto(ref, bg), v.mask)));
      outcomes.set(n, {
        frame: n,
        status: 'compared',
        matchPercent: v.matchHundredths / 100,
        differingPixels: v.differingPixels,
        totalPixels: v.totalPixels,
      });
    }
  } finally {
    await rm(ffdecDir, { recursive: true, force: true }).catch(() => undefined);
  }

  // 4. Behaviour: Replay against the reference trace.
  const behaviour = await runBehaviour(req, deps, problems);

  // 5. Report.
  const report = buildFidelityReport({
    sample: req.sampleName,
    stage,
    background,
    tools: { ffdec: FFDEC_VERSION, playwright: PLAYWRIGHT_VERSION, pngjs: PNGJS_VERSION },
    frameSample: sample,
    frames: [...outcomes.values()],
    limits: knownVisualLimits(req.scene, req.unsupported),
    behaviour,
    knownBehaviourGaps: KNOWN_BEHAVIOUR_GAPS,
    problems,
    translation: req.translationReport,
  });
  const jsonPath = join(outputDir, 'fidelity-report.json');
  const htmlPath = join(outputDir, 'fidelity-report.html');
  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, serialiseFidelityReport(report), 'utf8');
  await writeFile(htmlPath, renderFidelityHtml(report), 'utf8');
  return {
    overallMatch: report.visual.overallMatch,
    traceScore: report.behaviour.status === 'compared' ? report.behaviour.traceScore : null,
    missing: report.behaviour.status === 'compared' ? report.behaviour.missing.length : 0,
    extra: report.behaviour.status === 'compared' ? report.behaviour.extra.length : 0,
    inputNoteLines: report.behaviour.status === 'compared' ? formatInputNotes(report.behaviour.replay.inputNotes) : [],
    jsonPath,
    htmlPath,
  };
}

async function runBehaviour(req: VerifyRequest, deps: VerifyDeps, problems: Problem[]): Promise<BehaviourInput> {
  const dir = req.referenceDir === null ? null : resolve(req.referenceDir);
  const traceText = await readOptional(dir === null ? null : join(dir, 'output.txt'));
  if (traceText === null) return { status: 'not-compared', reason: 'no-reference-trace' };
  const tomlText = await readOptional(dir === null ? null : join(dir, 'test.toml'));
  const tickOptions = parseTickOptions(tomlText);
  // A custom tick_rate changes how many ticks Ruffle runs per frame; no Replay is run (Requirement 14.14).
  if (tickOptions.tickRate !== null) return { status: 'not-compared', reason: 'tick-rate' };
  const referenceLines = splitTraceLines(traceText);
  const emptyReference = referenceLines.length === 0;
  const numFrames = parseNumFrames(tomlText);
  const numFramesSource = tickOptions.numFrames !== null ? 'num_frames' : 'num_ticks';
  const inputText = await readOptional(dir === null ? null : join(dir, 'input.json'));
  let inputSource: ReplayInputSource = 'reference-input';
  let plan: ReplayPlan | { error: string };
  if (inputText === null) {
    // No input.json: the input is [] when a tick count is known (Requirement 14.23). A tick count is
    // only needed to run a Replay, so an Empty_Reference_Trace without one runs none (F20).
    if (numFrames === null) {
      return { status: 'not-compared', reason: emptyReference ? 'empty-reference-trace' : 'no-reference-input' };
    }
    inputSource = 'empty';
    plan = planReplay('[]', numFrames, numFramesSource);
  } else {
    plan = planReplay(inputText, numFrames, numFramesSource);
  }
  if ('error' in plan) {
    return { status: 'not-compared', reason: emptyReference ? 'empty-reference-trace' : 'invalid-input-json' };
  }
  for (const p of plan.problems) {
    const problem: Problem = { kind: p.kind, index: p.index };
    if (p.kind === 'unsupported-input') problem.detail = p.detail;
    problems.push(problem);
  }
  const groups = inputText === null ? null : planReplay(inputText, null);
  const inputGroups = groups === null || 'error' in groups ? plan.tickCount : groups.tickCount;

  let result: ReplayResult;
  try {
    result = await deps.replay(resolve(req.projectDir), plan);
  } catch (err) {
    result = { lines: [], ticksRun: 0, error: { tick: 0, message: describe(err) }, releaseOutside: [], childFailure: true };
  }
  const decision = decideBehaviour(referenceLines, {
    lines: result.lines.map((l) => l.text),
    ticksRun: result.ticksRun,
    error: result.error,
    childFailure: result.childFailure === true,
  });
  if (decision.problem !== null) problems.push(decision.problem);
  if (decision.status === 'not-compared') return { status: 'not-compared', reason: decision.reason };
  // release-outside is never a problem (decided F17); it lives in the notes only.
  const inputNotes = buildInputNotes(plan.problems, result.releaseOutside);
  const comparison = decision.comparison;
  return {
    status: 'compared',
    comparison,
    replay: { ticks: plan.tickCount, inputGroups, clicks: plan.pressReleasePairs,
      pointerEvents: plan.pointers.filter((p) => p.tick < plan.tickCount).length,
      ticksRun: decision.ticksRun,
      inputNotes,
      inputSource,
    },
  };
}
