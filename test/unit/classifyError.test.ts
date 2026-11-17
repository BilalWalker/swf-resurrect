import { describe, expect, it } from "vitest";
import { classifyError } from "../../src/outcome/classifyError";
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
    [new FfdecNotFoundError("tools/ffdec"), "failed", "internal-error", 1],
    [new MissingExportError(["shapes"]), "failed", "internal-error", 1],
    [new XmlVersionError("9.9", "4.2"), "failed", "internal-error", 1],
    [new MissingHeaderValueError(["frameRate"]), "failed", "internal-error", 1],
  ])("%o at unpack", (err, outcome, reasonCode, exitCode) => {
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
});
