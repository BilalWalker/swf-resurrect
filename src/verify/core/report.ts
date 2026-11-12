// Fidelity_Report (design section 9 and Data Models).
// Pure: no node:* imports, no clock, no randomness, no locale-dependent calls.
import { canonicalJson } from '../../pipeline/canonicalJson';
import type { ClassStatus, TranslationReport } from '../../translate/report';
import { AA_TOLERANCE, FORMAT_VERSION } from './constants';
import type { VisualLimit } from './limits';
import { meanHundredths } from './pixelDiff';
import { sanitizeDetail } from './sanitize';
import type { Divergence, TraceComparison, TraceLine } from './traceCompare';

export type { VisualLimit } from './limits';

export type ProblemKind =
  | 'reference-unavailable'
  | 'size-mismatch'
  | 'render-failed'
  | 'unsupported-input'
  | 'unpaired-mouse-event'
  | 'unused-input'
  | 'replay-error';

export interface Problem {
  kind: ProblemKind;
  frame?: number;
  index?: number;
  tick?: number;
  detail?: string;
}

export type FrameOutcome =
  | { frame: number; status: 'compared'; matchPercent: number; differingPixels: number; totalPixels: number }
  | { frame: number; status: 'not-compared'; reason: 'reference-unavailable' | 'size-mismatch' | 'render-failed' };

export type BehaviourInput =
  | {
      status: 'not-compared';
      reason: 'no-reference-trace' | 'no-reference-input' | 'invalid-input-json' | 'trace-too-large' | 'replay-failed' | 'tick-rate';
    }
  | {
      status: 'compared';
      comparison: Extract<TraceComparison, { kind: 'compared' }>;
      replay: { ticks: number; inputGroups: number; clicks: number };
    };

export interface FidelityInputs {
  sample: string;
  stage: { width: number; height: number };
  background: string; // '#rrggbb'
  /** Pinned tool versions, copied in by the edge (edge/versions.ts). */
  tools: { ffdec: string; playwright: string; pngjs: string };
  frameSample: readonly number[];
  frames: ReadonlyArray<FrameOutcome>; // any order; the builder sorts
  limits: readonly VisualLimit[];
  behaviour: BehaviourInput;
  knownBehaviourGaps: readonly string[]; // KNOWN_BEHAVIOUR_GAPS
  problems: readonly Problem[];
  translation: TranslationReport; // copied: typeCheck + class names/status/overridden/omitted
}

export interface FrameImages {
  reference: string;
  rendered: string;
  diff: string;
}

export type VisualFrame =
  | {
      frame: number;
      status: 'compared';
      matchPercent: number;
      differingPixels: number;
      totalPixels: number;
      images: FrameImages;
    }
  | { frame: number; status: 'not-compared'; reason: 'reference-unavailable' | 'size-mismatch' | 'render-failed' };

export type BehaviourReport =
  | {
      status: 'not-compared';
      reason: 'no-reference-trace' | 'no-reference-input' | 'invalid-input-json' | 'trace-too-large' | 'replay-failed' | 'tick-rate';
      knownBehaviourGaps: string[];
    }
  | {
      status: 'compared';
      referenceLineCount: number;
      capturedLineCount: number;
      matched: number;
      missing: TraceLine[];
      extra: TraceLine[];
      traceScore: number;
      firstDivergence: Divergence | null;
      replay: { ticks: number; inputGroups: number; clicks: number };
      knownBehaviourGaps: string[];
    };

export interface FidelityReport {
  formatVersion: 1;
  sample: string;
  stage: { width: number; height: number };
  tools: { ffdec: string; playwright: string; pngjs: string };
  tolerance: { background: string; strict: number; edgeMax: number; edgeContrast: number; neighbourhood: '3x3' };
  visual: {
    status: 'compared' | 'not-compared';
    frameSample: number[];
    frames: VisualFrame[];
    comparedFrames: number;
    notComparedFrames: number;
    overallMatch: number | null;
    knownVisualLimits: VisualLimit[];
  };
  behaviour: BehaviourReport;
  problems: Problem[];
  translation: { typeCheck: 'ran' | 'skipped'; classes: Array<{ className: string; status: ClassStatus; overridden: boolean; omitted: boolean }> };
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0; // UTF-16 code unit order
}

function cmpNum(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Order: (frame, kind, index, message); missing frame after all numbers, missing index as -1. Ties: tick. */
export function compareProblems(a: Problem, b: Problem): number {
  if (a.frame === undefined && b.frame !== undefined) return 1;
  if (a.frame !== undefined && b.frame === undefined) return -1;
  return (
    cmpNum(a.frame ?? 0, b.frame ?? 0) ||
    cmpStr(a.kind, b.kind) ||
    cmpNum(a.index ?? -1, b.index ?? -1) ||
    cmpStr(a.detail ?? '', b.detail ?? '') ||
    cmpNum(a.tick ?? -1, b.tick ?? -1)
  );
}

function compareLimits(a: VisualLimit, b: VisualLimit): number {
  return cmpStr(a.kind, b.kind) || cmpNum(a.id ?? -1, b.id ?? -1) || cmpStr(a.message, b.message);
}

function imagePath(frame: number, suffix: string): string {
  return `verify/frames/${String(frame).padStart(4, '0')}-${suffix}.png`;
}

function cleanProblem(p: Problem): Problem {
  const out: Problem = { kind: p.kind };
  if (p.frame !== undefined) out.frame = p.frame;
  if (p.index !== undefined) out.index = p.index;
  if (p.tick !== undefined) out.tick = p.tick;
  if (p.detail !== undefined) out.detail = sanitizeDetail(p.detail);
  return out;
}

function buildBehaviour(b: BehaviourInput, gaps: string[]): BehaviourReport {
  if (b.status === 'not-compared') {
    return { status: 'not-compared', reason: b.reason, knownBehaviourGaps: gaps };
  }
  const c = b.comparison;
  return {
    status: 'compared',
    referenceLineCount: c.referenceLineCount,
    capturedLineCount: c.capturedLineCount,
    matched: c.matched,
    missing: c.missing.map((l) => ({ line: l.line, text: l.text })),
    extra: c.extra.map((l) => ({ line: l.line, text: l.text })),
    traceScore: c.traceScore,
    firstDivergence: c.firstDivergence === null ? null : { ...c.firstDivergence },
    replay: { ticks: b.replay.ticks, inputGroups: b.replay.inputGroups, clicks: b.replay.clicks },
    knownBehaviourGaps: gaps,
  };
}

export function buildFidelityReport(i: FidelityInputs): FidelityReport {
  const sortedFrames = [...i.frames].sort((a, b) => cmpNum(a.frame, b.frame));
  const frames: VisualFrame[] = sortedFrames.map((f) =>
    f.status === 'compared'
      ? {
          frame: f.frame,
          status: 'compared',
          matchPercent: f.matchPercent,
          differingPixels: f.differingPixels,
          totalPixels: f.totalPixels,
          images: {
            reference: imagePath(f.frame, 'reference'),
            rendered: imagePath(f.frame, 'rendered'),
            diff: imagePath(f.frame, 'diff'),
          },
        }
      : { frame: f.frame, status: 'not-compared', reason: f.reason },
  );

  const comparedPercents: number[] = [];
  for (const f of sortedFrames) {
    if (f.status === 'compared') comparedPercents.push(Math.round(f.matchPercent * 100));
  }
  const comparedFrames = comparedPercents.length;

  const limits: VisualLimit[] = [];
  const seen = new Set<string>();
  for (const l of [...i.limits].sort(compareLimits)) {
    const key = `${l.kind}\u0000${l.id ?? ''}\u0000${l.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    limits.push(l.id === undefined ? { kind: l.kind, message: l.message } : { kind: l.kind, id: l.id, message: l.message });
  }

  const gaps = [...new Set(i.knownBehaviourGaps)].sort(cmpStr);

  return {
    formatVersion: FORMAT_VERSION,
    sample: i.sample,
    stage: { width: i.stage.width, height: i.stage.height },
    tools: { ffdec: i.tools.ffdec, playwright: i.tools.playwright, pngjs: i.tools.pngjs },
    tolerance: {
      background: i.background,
      strict: AA_TOLERANCE.strict,
      edgeMax: AA_TOLERANCE.edgeMax,
      edgeContrast: AA_TOLERANCE.edgeContrast,
      neighbourhood: AA_TOLERANCE.neighbourhood,
    },
    visual: {
      status: comparedFrames > 0 ? 'compared' : 'not-compared',
      frameSample: [...i.frameSample],
      frames,
      comparedFrames,
      notComparedFrames: frames.length - comparedFrames,
      overallMatch: comparedFrames > 0 ? meanHundredths(comparedPercents) / 100 : null,
      knownVisualLimits: limits,
    },
    behaviour: buildBehaviour(i.behaviour, gaps),
    problems: i.problems.map(cleanProblem).sort(compareProblems),
    translation: {
      typeCheck: i.translation.typeCheck,
      classes: i.translation.classes
        .map((c) => ({ className: c.className, status: c.status, overridden: c.overridden, omitted: c.omitted }))
        .sort((a, b) => cmpStr(a.className, b.className)),
    },
  };
}

export function serialiseFidelityReport(r: FidelityReport): string {
  return canonicalJson(r, 'fidelityReport');
}
