import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DisplayListEntry, SpriteSymbol } from "../../template/runtime/scene";
import { ScriptQueue } from "../../template/runtime/scriptQueue";
import type { DisplayObject } from "../../template/shim/DisplayObject";
import {
  buildFrameOne,
  step,
  withConstructionContext,
  type ConstructionContext,
} from "../../template/shim/internal";
import { MovieClip } from "../../template/shim/MovieClip";
import { fcConfig } from "./config";
import { genClipScenario, type ClipOp, type ClipSpec, type FrameArg } from "./gen/genClipOps";

const ID: DisplayListEntry["matrix"] = [1, 0, 0, 1, 0, 0];
const CT: DisplayListEntry["colorTransform"] = [1, 1, 1, 1, 0, 0, 0, 0];

interface RefState {
  frame: number;
  playing: boolean;
}

/** Independent reference machine for frame and play state. */
function refApply(s: RefState, spec: ClipSpec, op: ClipOp): { next: RefState; valid: boolean } {
  const resolve = (x: FrameArg): number | null => {
    if (typeof x === "string") return spec.labels.find((l) => l.name === x)?.frame ?? null;
    return Number.isInteger(x) && x >= 1 && x <= spec.totalFrames ? x : null;
  };
  switch (op.kind) {
    case "play":
      return { next: { ...s, playing: true }, valid: true };
    case "stop":
      return { next: { ...s, playing: false }, valid: true };
    case "tick":
      if (s.playing && spec.totalFrames > 1) {
        return { next: { ...s, frame: s.frame >= spec.totalFrames ? 1 : s.frame + 1 }, valid: true };
      }
      return { next: s, valid: true };
    case "gotoAndPlay":
    case "gotoAndStop": {
      const t = resolve(op.arg);
      if (t === null) return { next: s, valid: false };
      return { next: { frame: t, playing: op.kind === "gotoAndPlay" }, valid: true };
    }
  }
}

function clipSymbol(spec: ClipSpec): SpriteSymbol {
  return {
    type: "sprite",
    frameCount: spec.totalFrames,
    frames: Array.from({ length: spec.totalFrames }, () => []),
    labels: spec.labels,
  };
}

function childEntry(depth: number, symbolId: number): DisplayListEntry {
  return { depth, symbolId, matrix: ID, colorTransform: CT, name: `c${depth}` };
}

/** A one-frame parent holding two child clips built from the given specs. */
function build(specs: [ClipSpec, ClipSpec]): { parent: MovieClip; kids: [MovieClip, MovieClip] } {
  const scripts = new ScriptQueue();
  const hooks: ConstructionContext["hooks"] = {
    createChild: (e) => {
      const spec = specs[e.symbolId - 2]!;
      return withConstructionContext(
        { symbol: clipSymbol(spec), symbolId: e.symbolId, scripts, hooks, named: true, instance: null },
        () => new MovieClip(),
      ) as DisplayObject;
    },
    childAttached: () => {},
    childDetached: () => {},
    applyMatrix: () => {},
    applyColorTransform: () => {},
    constructFrameOne: (mc) => buildFrameOne(mc),
  };
  const parentSym: SpriteSymbol = {
    type: "sprite",
    frameCount: 1,
    frames: [[childEntry(1, 2), childEntry(2, 3)]],
    labels: [],
  };
  const parent = withConstructionContext(
    { symbol: parentSym, symbolId: 1, scripts, hooks, named: false, instance: null },
    () => new MovieClip(),
  );
  const kids = [(parent as unknown as { c1: MovieClip }).c1, (parent as unknown as { c2: MovieClip }).c2];
  return { parent, kids: kids as [MovieClip, MovieClip] };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("MovieClip state machine", () => {
  /**
   * Property 15: MovieClip frame and play-state transitions follow a reference machine
   * **Validates: Requirements 6.12, 7.3, 7.5, 7.6, 7.7, 7.16**
   */
  it("Property 15: transitions follow a reference machine", () => {
    fc.assert(
      fc.property(genClipScenario, (sc) => {
        const { parent, kids } = build(sc.specs);
        const refs: [RefState, RefState] = [
          { frame: 1, playing: true },
          { frame: 1, playing: true },
        ];
        const parentRef = { frame: parent.currentFrame, playing: true };
        for (const { target, op } of sc.ops) {
          const clip = kids[target];
          warn.mockClear();
          if (op.kind === "tick") {
            // A tick on the parent steps both children; the parent has one frame and stays put.
            step(parent);
            for (const i of [0, 1] as const) refs[i] = refApply(refs[i], sc.specs[i], op).next;
          } else {
            const { next, valid } = refApply(refs[target], sc.specs[target], op);
            const otherBefore = { f: kids[1 - target]!.currentFrame, p: kids[1 - target]!._playing };
            if (op.kind === "play") clip.play();
            else if (op.kind === "stop") clip.stop();
            else if (op.kind === "gotoAndPlay") clip.gotoAndPlay(op.arg);
            else clip.gotoAndStop(op.arg);
            refs[target] = next;
            if (valid) {
              expect(warn).not.toHaveBeenCalled();
            } else {
              expect(warn).toHaveBeenCalledTimes(1);
              expect(String(warn.mock.calls[0]![0])).toContain(String((op as { arg: FrameArg }).arg));
            }
            // The sibling is unaffected by operations on this clip.
            expect(kids[1 - target]!.currentFrame).toBe(otherBefore.f);
            expect(kids[1 - target]!._playing).toBe(otherBefore.p);
          }
          for (const i of [0, 1] as const) {
            expect(kids[i].currentFrame).toBe(refs[i].frame);
            expect(kids[i]._playing).toBe(refs[i].playing);
          }
          // The parent is unaffected by anything done to its children.
          expect(parent.currentFrame).toBe(parentRef.frame);
          expect(parent._playing).toBe(parentRef.playing);
        }
      }),
      fcConfig,
    );
  });

  it("example: invalid label leaves a stopped clip stopped with one warning naming it", () => {
    const { kids } = build([
      { totalFrames: 3, labels: [{ name: "L0", frame: 2 }] },
      { totalFrames: 1, labels: [] },
    ]);
    kids[0].gotoAndStop("L0");
    warn.mockClear();
    kids[0].gotoAndPlay("missing");
    expect(kids[0].currentFrame).toBe(2);
    expect(kids[0]._playing).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("missing");
  });
});
