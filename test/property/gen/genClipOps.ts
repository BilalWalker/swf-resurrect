import fc from "fast-check";

export type FrameArg = number | string;

export type ClipOp =
  | { kind: "play" }
  | { kind: "stop" }
  | { kind: "gotoAndPlay"; arg: FrameArg }
  | { kind: "gotoAndStop"; arg: FrameArg }
  | { kind: "tick" };

export interface Label {
  name: string;
  frame: number;
}

export interface ClipSpec {
  totalFrames: number;
  labels: Label[];
}

/** A clip with 1..6 frames and unique label names (all prefixed so they are never numeric). */
export const genClipSpec: fc.Arbitrary<ClipSpec> = fc
  .integer({ min: 1, max: 6 })
  .chain((totalFrames) =>
    fc
      .uniqueArray(fc.integer({ min: 1, max: totalFrames }), { maxLength: totalFrames })
      .map((frames) => ({
        totalFrames,
        labels: frames.map((frame, i) => ({ name: `L${i}`, frame })),
      })),
  );

/** A frame argument that is valid, a known label, out of range, or an unknown label. */
export function genFrameArg(spec: ClipSpec): fc.Arbitrary<FrameArg> {
  const total = spec.totalFrames;
  const options: Array<fc.Arbitrary<FrameArg>> = [
    fc.integer({ min: 1, max: total }),
    fc.oneof(
      fc.integer({ min: -5, max: 0 }),
      fc.integer({ min: total + 1, max: total + 5 }),
      fc.constant(1.5),
      fc.constant(NaN),
    ),
    fc.constantFrom("nope", "Lx", "").map((s) => s as FrameArg),
  ];
  if (spec.labels.length > 0) {
    options.push(fc.constantFrom(...spec.labels.map((l) => l.name)));
  }
  return fc.oneof(...options);
}

export function genClipOp(spec: ClipSpec): fc.Arbitrary<ClipOp> {
  return fc.oneof(
    fc.constant<ClipOp>({ kind: "play" }),
    fc.constant<ClipOp>({ kind: "stop" }),
    fc.constant<ClipOp>({ kind: "tick" }),
    genFrameArg(spec).map<ClipOp>((arg) => ({ kind: "gotoAndPlay", arg })),
    genFrameArg(spec).map<ClipOp>((arg) => ({ kind: "gotoAndStop", arg })),
  );
}

/** One scenario: a spec for each of two child clips, and ops, each aimed at child 0 or 1. */
export interface ClipScenario {
  specs: [ClipSpec, ClipSpec];
  ops: Array<{ target: 0 | 1; op: ClipOp }>;
}

export const genClipScenario: fc.Arbitrary<ClipScenario> = fc
  .tuple(genClipSpec, genClipSpec)
  .chain(([a, b]) =>
    fc
      .array(
        fc.integer({ min: 0, max: 1 }).chain((t) =>
          genClipOp(t === 0 ? a : b).map((op) => ({ target: t as 0 | 1, op })),
        ),
        { maxLength: 30 },
      )
      .map((ops) => ({ specs: [a, b] as [ClipSpec, ClipSpec], ops })),
  );
