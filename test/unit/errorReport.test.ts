import { afterEach, describe, expect, it, vi } from "vitest";
import { constructorSite, frameScriptSite, listenerSite, messageOf } from "../../template/runtime/errorReport";
import { reportCaughtError, setCaughtErrorSink } from "../../template/shim/internal";

afterEach(() => {
  setCaughtErrorSink(null);
  vi.restoreAllMocks();
});

describe("messageOf", () => {
  it("takes the message of an Error, without the stack", () => {
    const m = messageOf(new Error("boom"));
    expect(m).toBe("boom");
    expect(m).not.toContain("\n");
  });
  it("takes a string as it is", () => {
    expect(messageOf("plain")).toBe("plain");
  });
  it("stringifies an object and undefined", () => {
    expect(messageOf({ toString: () => "custom" })).toBe("custom");
    expect(messageOf(undefined)).toBe("undefined");
  });
  it("survives an object whose toString throws", () => {
    expect(messageOf({ toString: () => { throw new Error("x"); } })).toBe("[object Object]");
  });
  it("removes colour codes", () => {
    expect(messageOf(new Error("\u001b[31mred\u001b[0m text"))).toBe("red text");
  });
});

describe("site texts", () => {
  it("builds the three Error_Sites", () => {
    expect(constructorSite("Main")).toBe("constructor Main");
    expect(frameScriptSite("Main", 3)).toBe("frame script Main frame 3");
    expect(listenerSite("click", "Button")).toBe("listener click on Button");
  });
});

describe("caught-error sink", () => {
  const err = { site: "constructor Main", message: "boom", className: "Main" };

  it("the default sink prints once with console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportCaughtError(err);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[SWF Resurrect] constructor Main: boom");
  });

  it("a set sink receives the error and the default stays silent", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const got: unknown[] = [];
    setCaughtErrorSink((e) => got.push(e));
    reportCaughtError(err);
    expect(got).toEqual([err]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("setCaughtErrorSink(null) restores the default", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    setCaughtErrorSink(() => {});
    setCaughtErrorSink(null);
    reportCaughtError(err);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
