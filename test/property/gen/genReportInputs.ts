import * as fc from 'fast-check';
import type {
  BehaviourInput,
  FidelityInputs,
  FrameOutcome,
  Problem,
  ProblemKind,
  VisualLimit,
} from '../../../src/verify/core/report';
import type { ClassStatus, TranslationReport } from '../../../src/translate/report';

const frameNo = fc.integer({ min: 1, max: 60 });
const text = fc.string({ maxLength: 20 });
const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);

const genCompared: fc.Arbitrary<FrameOutcome> = fc
  .record({
    frame: frameNo,
    hundredths: fc.integer({ min: 0, max: 10000 }),
    differingPixels: fc.integer({ min: 0, max: 5000 }),
    totalPixels: fc.integer({ min: 1, max: 100000 }),
  })
  .map((r) => ({
    frame: r.frame,
    status: 'compared' as const,
    matchPercent: r.hundredths / 100,
    differingPixels: r.differingPixels,
    totalPixels: r.totalPixels,
  }));

const genNotCompared: fc.Arbitrary<FrameOutcome> = fc.record({
  frame: frameNo,
  status: fc.constant('not-compared' as const),
  reason: fc.constantFrom('reference-unavailable' as const, 'size-mismatch' as const, 'render-failed' as const),
});

const genFrames = fc.array(fc.oneof(genCompared, genNotCompared), { maxLength: 12 });

const genLimit: fc.Arbitrary<VisualLimit> = fc.oneof(
  fc.record({
    kind: fc.constantFrom('colour-offset' as const, 'skewed-matrix' as const, 'unsupported-feature' as const),
    message: text,
  }),
  fc.record({
    kind: fc.constantFrom('colour-offset' as const, 'skewed-matrix' as const, 'unsupported-feature' as const),
    id: fc.integer({ min: 0, max: 50 }),
    message: text,
  }),
);

const genTraceLines = fc
  .array(fc.record({ line: fc.integer({ min: 1, max: 200 }), text }), { maxLength: 6 });

const genDivergence = fc.option(
  fc.record({
    index: fc.integer({ min: 1, max: 200 }),
    reference: fc.option(text, { nil: null }),
    captured: fc.option(text, { nil: null }),
  }),
  { nil: null },
);

const genBehaviour: fc.Arbitrary<BehaviourInput> = fc.oneof(
  fc.record({
    status: fc.constant('not-compared' as const),
    reason: fc.constantFrom(
      'no-reference-trace' as const,
      'no-reference-input' as const,
      'invalid-input-json' as const,
      'trace-too-large' as const,
      'replay-failed' as const,
      'tick-rate' as const,
      'empty-reference-trace' as const,
    ),
  }),
  fc.record({
    status: fc.constant('compared' as const),
    comparison: fc.record({
      kind: fc.constant('compared' as const),
      referenceLineCount: fc.integer({ min: 0, max: 200 }),
      capturedLineCount: fc.integer({ min: 0, max: 200 }),
      matched: fc.integer({ min: 0, max: 200 }),
      missing: genTraceLines,
      extra: genTraceLines,
      traceScore: fc.integer({ min: 0, max: 10000 }).map((n) => n / 100),
      firstDivergence: genDivergence,
    }),
    replay: fc.record({
      ticks: fc.integer({ min: 0, max: 100 }),
      inputGroups: fc.integer({ min: 0, max: 100 }),
      clicks: fc.integer({ min: 0, max: 20 }),
      pointerEvents: fc.integer({ min: 0, max: 40 }),
      ticksRun: fc.integer({ min: 0, max: 100 }),
      inputNotes: fc.constant([] as never[]),
      inputSource: fc.constantFrom('reference-input' as const, 'empty' as const),
    }),
  }),
);

const problemKinds: ProblemKind[] = [
  'reference-unavailable',
  'size-mismatch',
  'render-failed',
  'unsupported-input',
  'unpaired-mouse-event',
  'unused-input',
  'replay-error',
];

const genProblem: fc.Arbitrary<Problem> = fc
  .record(
    {
      kind: fc.constantFrom(...problemKinds),
      frame: frameNo,
      index: fc.integer({ min: 0, max: 50 }),
      tick: fc.integer({ min: 0, max: 50 }),
      detail: fc.oneof(text, fc.constant('failed at C:\\Users\\x\\file.png\nsecond line')),
    },
    { requiredKeys: ['kind'] },
  )
  .map((p) => p as Problem);

const genTranslation: fc.Arbitrary<TranslationReport> = fc
  .record({
    typeCheck: fc.constantFrom('ran' as const, 'skipped' as const),
    classes: fc.array(
      fc.record({
        className: fc.stringMatching(/^[A-Z][A-Za-z0-9]{0,8}$/),
        status: fc.constantFrom<ClassStatus>('clean', 'loose', 'unsupported'),
        overridden: fc.boolean(),
        omitted: fc.boolean(),
        loose: fc.boolean(),
      }),
      { maxLength: 6 },
    ),
  })
  .map((r) => ({
    formatVersion: 1 as const,
    typeCheck: r.typeCheck,
    classes: r.classes.map((c) => ({ ...c, diagnostics: [], typeErrors: [] })),
    omittedClasses: [],
    otherErrors: [],
    classPaths: [],
  }));

export const genReportInputs: fc.Arbitrary<FidelityInputs> = fc.record({
  sample: fc.stringMatching(/^[a-z][a-z0-9_-]{0,10}$/),
  stage: fc.record({ width: fc.integer({ min: 1, max: 1000 }), height: fc.integer({ min: 1, max: 1000 }) }),
  background: hex,
  tools: fc.record({ ffdec: text, playwright: text, pngjs: text }),
  frameSample: fc.array(frameNo, { maxLength: 8 }),
  frames: genFrames,
  limits: fc.array(genLimit, { maxLength: 6 }),
  behaviour: genBehaviour,
  knownBehaviourGaps: fc.array(fc.string({ maxLength: 12 }), { maxLength: 4 }),
  problems: fc.array(genProblem, { maxLength: 8 }),
  translation: genTranslation,
});
