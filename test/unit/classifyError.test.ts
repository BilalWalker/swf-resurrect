import { describe, expect, it } from "vitest";
import { convertModel } from "../../src/convert/convertModel";
import {
  MalformedFrameDataError,
  MalformedSvgError,
  ShapeExportError,
  SymbolCycleError,
  UnknownSymbolError,
} from "../../src/convert/errors";
import type { TagsModel, TimelineOp } from "../../src/convert/model";
import { InvalidClassNameError } from "../../src/convert/qualifiedName";
import { ERROR_TABLE, classifyError } from "../../src/outcome/classifyError";
import { decideOutcome, type RunRecord } from "../../src/outcome/outcome";
import {
  FfdecExitError,
  FfdecNotFoundError,
  FfdecTimeoutError,
  InvalidSwfError,
  JavaNotFoundError,
  MissingExportError,
  MissingHeaderValueError,
  NotAs3Error,
  XmlVersionError,
} from "../../src/unpack/errors";

function decide(err: unknown, stage: string) {
  const record: RunRecord = {
    facts: null,
    stages: [],
    failure: classifyError(err, stage),
    numbers: null,
    gaps: [],
    limits: { maxSizeMiB: 20, runLimitS: 300, stageLimitS: 60, stageWeights: {} },
    recovery: null,
  };
  return decideOutcome(record);
}

describe("classifyError", () => {
  it.each([
    [new InvalidSwfError("x.swf"), "refused", "not-swf", 3],
    [new NotAs3Error(), "refused", "actionscript-1-2", 3],
    [new FfdecTimeoutError(60), "refused", "time-limit", 3],
    [new FfdecExitError(1, "boom"), "refused", "damaged", 3],
    [new JavaNotFoundError(), "failed", "internal-error", 1],
    [new MalformedFrameDataError("root", 1, "place without character"), "refused", "damaged", 3],
    [new UnknownSymbolError(9, 0, 1, 1), "refused", "damaged", 3],
    [new SymbolCycleError([2, 3, 2]), "refused", "damaged", 3],
    [new ShapeExportError(1, "missing"), "failed", "internal-error", 1],
    [new MalformedSvgError("1.svg"), "failed", "internal-error", 1],
    [new InvalidClassNameError("a/b", "bad", "convert"), "failed", "internal-error", 1],
    [new FfdecNotFoundError("tools/ffdec"), "failed", "internal-error", 1],
    [new MissingExportError(["shapes"]), "failed", "internal-error", 1],
    [new XmlVersionError("9.9", "4.2"), "failed", "internal-error", 1],
    [new MissingHeaderValueError(["frameRate"]), "failed", "internal-error", 1],
  ])("%s at unpack", (err, outcome, reasonCode, exitCode) => {
    expect(decide(err, "unpack")).toMatchObject({ outcome, reasonCode, exitCode });
  });

  it("says a component is missing without naming a tool", () => {
    for (const err of [new JavaNotFoundError(), new FfdecNotFoundError("p")]) {
      const reason = decide(err, "unpack").reason;
      expect(reason).toBe("a required component is missing");
    }
  });

  it("keeps FFDec text out of the reason of a damaged refusal", () => {
    const o = decide(new FfdecExitError(1, "Exception in thread main java.lang.Foo"), "unpack");
    expect(o.reason).toBe("the file could not be read");
  });

  it("maps a non-Error value to failed internal-error", () => {
    for (const v of ["FFDEC_EXIT", { code: "FFDEC_EXIT" }, null, undefined, 42]) {
      expect(decide(v, "unpack")).toMatchObject({ outcome: "failed", reasonCode: "internal-error" });
    }
  });

  it("maps an error with an unknown code to failed internal-error", () => {
    const err = Object.assign(new Error("x"), { code: "ENOENT" });
    expect(decide(err, "convert")).toMatchObject({ outcome: "failed", reasonCode: "internal-error" });
  });

  it("tells an FFDec exit at Unpack from a TypeError at Unpack", () => {
    expect(decide(new FfdecExitError(1, "x"), "unpack").outcome).toBe("refused");
    expect(decide(new TypeError("x is not a function"), "unpack").outcome).toBe("failed");
  });

  it("does not read an FFDec exit of another stage as damaged", () => {
    expect(decide(new FfdecExitError(1, "x"), "verify")).toMatchObject({ outcome: "failed", reasonCode: "internal-error" });
  });

  it("does not look at the message text", () => {
    expect(decide(new Error("FFDEC_EXIT INVALID_SWF"), "unpack").outcome).toBe("failed");
  });

  it("lists every row of the table with a code the classifier honours", () => {
    for (const row of ERROR_TABLE) {
      const err = Object.assign(new Error("x"), { code: row.code });
      const f = classifyError(err, row.refusedAtStage ?? "convert");
      expect(f.kind, row.code).toBe(row.kind);
      expect(f.reasonCode, row.code).toBe(row.reasonCode);
    }
  });

  describe("broken frame data through the real Convert code", () => {
    const show: TimelineOp = { kind: "showFrame" };
    const model = (ops: TimelineOp[]): TagsModel => ({
      xmlVersion: { major: 4, minor: 2 },
      header: { widthPx: 100, heightPx: 100, frameRate: 24, frameCount: 1 },
      background: null,
      root: { declaredFrameCount: 1, ops },
      sprites: [],
      declaredShapeIds: [],
      morphShapeIds: [],
      staticTextIds: [],
      bitmapIds: [],
      shapeAssets: [],
      textAssets: [],
      symbolClasses: [],
      classSources: [],
      unsupported: [],
    });
    const thrown = (m: TagsModel): unknown => {
      try {
        convertModel(m);
      } catch (e) {
        return e;
      }
      throw new Error("expected convertModel to throw");
    };

    it("a move at an empty depth ends refused damaged, with no input text in the reason", () => {
      const e = thrown(model([{ kind: "place", depth: 3, move: true }, show]));
      expect(e).toBeInstanceOf(MalformedFrameDataError);
      const o = decide(e, "convert");
      expect(o).toMatchObject({ outcome: "refused", reasonCode: "damaged", exitCode: 3 });
      expect(o.reason).toBe("the file could not be read");
    });

    it("a placement of an undefined character ends refused damaged", () => {
      const e = thrown(model([{ kind: "place", depth: 1, characterId: 99, move: false }, show]));
      expect(e).toBeInstanceOf(UnknownSymbolError);
      expect(decide(e, "convert")).toMatchObject({ outcome: "refused", reasonCode: "damaged", exitCode: 3 });
    });
  });

  it("keeps a TypeError at convert failed internal-error", () => {
    expect(decide(new TypeError("x"), "convert")).toMatchObject({ outcome: "failed", reasonCode: "internal-error", exitCode: 1 });
  });
});
