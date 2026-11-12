import { describe, expect, it } from "vitest";
import {
  decideClassOmissions,
  isEmittedSpecifier,
  looseClasses,
  omissionMessage,
  type OmissionClass,
} from "../../src/emit/classOmissions";
import { gateError } from "../support/gateError";


const cls = (name: string, extra: Partial<OmissionClass> = {}): OmissionClass => ({
  className: name,
  path: `src/${name.replace(/\./g, "/")}.ts`,
  extendsQualified: null,
  importsQualified: [],
  handwritten: false,
  produced: true,
  ...extra,
});

describe("decideClassOmissions", () => {
  it("omits a class with a syntax error, with count and first line", () => {
    const errs = [
      gateError({ file: "src/A.ts", line: 9, code: 1005, message: "late", syntactic: true }),
      gateError({ file: "src/A.ts", line: 4, code: 1005, message: "early", syntactic: true }),
      gateError({ file: "src/A.ts", line: 2, code: 2322 }),
    ];
    const [o] = decideClassOmissions(errs, [cls("A")], []);
    expect(o.reason).toEqual({ kind: "syntax-error", count: 2, firstLine: 4, firstMessage: "early" });
  });

  it("omits on an unresolved relative import and not on the Shim or a package", () => {
    const rel = gateError({ file: "src/A.ts", line: 3, code: 2307, specifier: "./Nope" });
    expect(decideClassOmissions([rel], [cls("A")], [])[0].reason).toEqual({ kind: "unresolved-import", specifier: "./Nope", line: 3 });
    const shim = gateError({ file: "src/A.ts", code: 2307, specifier: "../shim" });
    const pkg = gateError({ file: "src/A.ts", code: 2792, specifier: "pixi.js" });
    expect(decideClassOmissions([shim, pkg], [cls("A")], [])).toEqual([]);
  });

  it("omits a linked class with no source, with its sorted symbol ids", () => {
    const r = decideClassOmissions([], [], [
      { symbolId: 7, className: "X" },
      { symbolId: 3, className: "X" },
    ]);
    expect(r).toEqual([{ className: "X", reason: { kind: "missing-source" }, symbolIds: [3, 7] }]);
  });

  it("omits a file Emit did not produce", () => {
    expect(decideClassOmissions([], [cls("A", { produced: false })], [])[0].reason).toEqual({ kind: "emit-failed" });
  });

  it("propagates by extends and by imports, naming the direct cause", () => {
    const classes = [
      cls("A", { produced: false }),
      cls("B", { extendsQualified: "A" }),
      cls("C", { extendsQualified: "B" }),
      cls("D", { importsQualified: ["C", "Z"] }),
      cls("Z"),
    ];
    const r = decideClassOmissions([], classes, []);
    const by = Object.fromEntries(r.map((o) => [o.className, o.reason]));
    expect(by.B).toEqual({ kind: "extends-omitted", base: "A" });
    expect(by.C).toEqual({ kind: "extends-omitted", base: "B" });
    expect(by.D).toEqual({ kind: "imports-omitted", imported: "C" });
    expect(by.Z).toBeUndefined();
  });

  describe("missing export", () => {
    const iface = cls("p.IThing", { exports: [] });
    const imp = (name: string, target: string, line = 2) => ({ target, name, line });

    it("omits a direct importer of a binding the target does not export, naming the binding and the target", () => {
      const user = cls("p.User", { importsQualified: ["p.IThing"], importedNames: [imp("IThing", "p.IThing", 4)] });
      const r = decideClassOmissions([], [iface, user], []);
      expect(r).toEqual([
        { className: "p.User", reason: { kind: "missing-export", name: "IThing", target: "p.IThing", line: 4 }, symbolIds: [] },
      ]);
      expect(omissionMessage(r[0])).toContain("imports IThing from p.IThing at line 4");
    });

    it("omits a transitive importer and an extender through the fixed point", () => {
      const user = cls("p.User", { importsQualified: ["p.IThing"], importedNames: [imp("IThing", "p.IThing")] });
      const deep = cls("p.Deep", { importsQualified: ["p.User"], importedNames: [imp("User", "p.User")], exports: ["Deep"] });
      const sub = cls("p.Sub", { extendsQualified: "p.Deep", exports: ["Sub"] });
      const by = Object.fromEntries(decideClassOmissions([], [iface, user, deep, sub], []).map((o) => [o.className, o.reason.kind]));
      expect(by).toEqual({ "p.User": "missing-export", "p.Deep": "imports-omitted", "p.Sub": "extends-omitted" });
    });

    it("keeps a class that imports only exported names, and ignores unknown or unchecked targets", () => {
      const ok = cls("p.Ok", { exports: ["Ok"] });
      const user = cls("p.User", {
        importsQualified: ["p.Ok", "p.Opaque", "p.Plain"],
        importedNames: [imp("Ok", "p.Ok"), imp("Anything", "p.Opaque"), imp("Anything", "p.Plain")],
      });
      const opaque = cls("p.Opaque", { exports: null });
      const plain = cls("p.Plain");
      expect(decideClassOmissions([], [ok, user, opaque, plain], [])).toEqual([]);
    });

    it("does not apply to a handwritten importer", () => {
      const user = cls("p.User", { handwritten: true, importedNames: [imp("IThing", "p.IThing")] });
      expect(decideClassOmissions([], [iface, user], [])).toEqual([]);
    });
  });

  it("keeps a class with only semantic errors and reports it as loose without an entry", () => {
    const codes = [2304, 2322, 2339, 2551, 2552, 2662, 2663, 2305, 2306, 1155];
    const errs = codes.map((code, i) => gateError({ file: "src/A.ts", line: i + 1, code }));
    expect(decideClassOmissions(errs, [cls("A")], [])).toEqual([]);
    const loose = looseClasses(errs, [cls("A")], []);
    expect(loose).toEqual([{ className: "A", count: 10, firstLine: 1, firstMessage: "bad" }]);
  });

  it("omits nothing for an error in main.ts, classes.ts, runtime or shim", () => {
    const errs = ["src/main.ts", "src/classes.ts", "runtime/p.ts", "shim/S.ts"].map((file) =>
      gateError({ file, code: 1005, syntactic: true }),
    );
    expect(decideClassOmissions(errs, [cls("A")], [])).toEqual([]);
  });

  it("never omits a handwritten class", () => {
    const errs = [gateError({ file: "src/A.ts", code: 1005, syntactic: true })];
    expect(decideClassOmissions(errs, [cls("A", { handwritten: true })], [])).toEqual([]);
    expect(looseClasses(errs, [cls("A", { handwritten: true })], [])).toEqual([]);
  });

  it("lists an unlinked omitted base with no symbol ids", () => {
    const classes = [cls("UIComponent", { produced: false }), cls("Btn", { extendsQualified: "UIComponent" })];
    const r = decideClassOmissions([], classes, [{ symbolId: 5, className: "Btn" }]);
    expect(r.map((o) => [o.className, o.symbolIds])).toEqual([
      ["Btn", [5]],
      ["UIComponent", []],
    ]);
  });
});

describe("isEmittedSpecifier and omissionMessage", () => {
  it("is false for the Shim and the runtime and true otherwise", () => {
    expect(isEmittedSpecifier("src/A.ts", "../shim")).toBe(false);
    expect(isEmittedSpecifier("src/a/B.ts", "../../runtime/x")).toBe(false);
    expect(isEmittedSpecifier("src/A.ts", "./Nope")).toBe(true);
    expect(isEmittedSpecifier("src/a/B.ts", "../shim/Y")).toBe(true);
  });

  it("names the cause", () => {
    const m = omissionMessage({ className: "a.B", reason: { kind: "unresolved-import", specifier: "./Q", line: 2 }, symbolIds: [4] });
    expect(m).toContain("a.B");
    expect(m).toContain("./Q");
    expect(m).toContain("4");
  });
});

