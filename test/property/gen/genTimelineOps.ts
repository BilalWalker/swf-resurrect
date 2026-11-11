import fc from "fast-check";
import type { ColorTransformModel, MatrixModel, TimelineOp, UnsupportedKind } from "../../../src/convert/model";

/** Character ids the resolver must drop, with the kind reported. */
export const UNSUPPORTED_CHARACTERS: ReadonlyMap<number, UnsupportedKind> = new Map<number, UnsupportedKind>([
  [900, "text"],
  [901, "sound"],
]);
const SUPPORTED_IDS = [1, 2, 3, 4, 5];
const UNSUPPORTED_IDS = [...UNSUPPORTED_CHARACTERS.keys()];
const LABEL_NAMES = ["a", "b", "c", "d"];
const NAMES = ["", "x", "y", "z"];

const genNum = fc.oneof(
  fc.constantFrom(0, -0, 1, -1, 0.5),
  fc.double({ noNaN: true, noDefaultInfinity: true, min: -4, max: 4 }),
);
const genMatrix: fc.Arbitrary<MatrixModel> = fc.record({
  a: genNum,
  b: genNum,
  c: genNum,
  d: genNum,
  txTwips: fc.integer({ min: -100000, max: 100000 }),
  tyTwips: fc.integer({ min: -100000, max: 100000 }),
});
const genCt: fc.Arbitrary<ColorTransformModel> = fc.record({
  mul: fc.tuple(genNum, genNum, genNum, genNum),
  add: fc.tuple(genNum, genNum, genNum, genNum),
});

/** One raw random decision; interpreted against tracked state so only valid sequences result. */
const genStep = fc.record({
  pick: fc.integer({ min: 0, max: 99 }),
  depthPick: fc.nat({ max: 1000 }),
  depth: fc.integer({ min: 0, max: 6 }),
  charPick: fc.nat({ max: 1000 }),
  unsupported: fc.boolean(),
  withChar: fc.boolean(),
  matrix: fc.option(genMatrix, { nil: undefined }),
  ct: fc.option(genCt, { nil: undefined }),
  name: fc.option(fc.constantFrom(...NAMES), { nil: undefined }),
  label: fc.constantFrom(...LABEL_NAMES),
});

/**
 * Valid timeline op sequences: moves only target occupied depths (or, without a
 * character id, depths dropped as unsupported), removes target occupied or dropped
 * depths, and the list ends with showFrame.
 */
export const genTimelineOps: fc.Arbitrary<TimelineOp[]> = fc
  .array(genStep, { minLength: 0, maxLength: 60 })
  .map((steps) => {
    const ops: TimelineOp[] = [];
    const occupied = new Set<number>();
    const dropped = new Set<number>();
    for (const s of steps) {
      const occ = [...occupied].sort((x, y) => x - y);
      const drp = [...dropped].sort((x, y) => x - y);
      const pickFrom = (arr: number[]): number => arr[s.depthPick % arr.length];
      const supportedId = SUPPORTED_IDS[s.charPick % SUPPORTED_IDS.length];
      if (s.pick < 30) {
        // place (fresh or replacing)
        const unsupported = s.unsupported && s.charPick % 3 === 0;
        const characterId = unsupported ? UNSUPPORTED_IDS[s.charPick % UNSUPPORTED_IDS.length] : supportedId;
        ops.push({ kind: "place", depth: s.depth, characterId, move: false, matrix: s.matrix, colorTransform: s.ct, name: s.name });
        if (unsupported) {
          occupied.delete(s.depth);
          dropped.add(s.depth);
        } else {
          occupied.add(s.depth);
          dropped.delete(s.depth);
        }
      } else if (s.pick < 55) {
        if (occ.length > 0) {
          const depth = pickFrom(occ);
          ops.push({
            kind: "place",
            depth,
            characterId: s.withChar ? supportedId : undefined,
            move: true,
            matrix: s.matrix,
            colorTransform: s.ct,
            name: s.name,
          });
        } else if (drp.length > 0) {
          // move without character at a dropped depth is ignored
          ops.push({ kind: "place", depth: pickFrom(drp), move: true, matrix: s.matrix });
        }
      } else if (s.pick < 70) {
        const all = [...occ, ...drp];
        if (all.length > 0) {
          const depth = pickFrom(all);
          ops.push({ kind: "remove", depth });
          occupied.delete(depth);
          dropped.delete(depth);
        }
      } else if (s.pick < 80) {
        ops.push({ kind: "label", name: s.label });
      } else {
        ops.push({ kind: "showFrame" });
      }
    }
    ops.push({ kind: "showFrame" });
    return ops;
  });
