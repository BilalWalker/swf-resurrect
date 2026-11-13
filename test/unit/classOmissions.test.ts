import { describe, expect, it } from "vitest";
import {
  decideClassOmissions,
  isEmittedSpecifier,
  looseClasses,
  omissionMessage,
  type BundlerCheckData,
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

describe("decideClassOmissions with Bundler_Checks", () => {
  const OK: BundlerCheckData = { verdict: { ok: true }, imports: [] };
  const bad = (message = "Unexpected token", phase: "transform" | "parse" = "parse"): BundlerCheckData => ({
    verdict: { ok: false, phase, message, line: 3, column: 7 },
    imports: [],
  });
  const iface = cls("p.IThing", { exports: [] });
  const imp = (name: string, target: string, specifier: string, line = 2) => ({ target, name, line, specifier });

  it("omits a class whose check fails, with phase, message, line and column", () => {
    const [o] = decideClassOmissions([], [cls("A", { bundler: bad("The keyword 'yield' is reserved") })], [{ symbolId: 2, className: "A" }]);
    expect(o).toEqual({
      className: "A",
      reason: { kind: "bundler-parse", phase: "parse", message: "The keyword 'yield' is reserved", line: 3, column: 7 },
      symbolIds: [2],
    });
    expect(omissionMessage(o)).toContain("The keyword 'yield' is reserved");
    expect(omissionMessage(o)).toContain("line 3, column 7");
  });

  it("omits a handwritten class whose check fails and by propagation only otherwise", () => {
    const hw = cls("H", { handwritten: true, bundler: bad("with") });
    expect(decideClassOmissions([], [hw], []).map((o) => o.reason.kind)).toEqual(["bundler-parse"]);
    const okHw = cls("H", { handwritten: true, bundler: OK, extendsQualified: "Base" });
    expect(decideClassOmissions([gateError({ file: "src/H.ts", code: 1005, syntactic: true })], [okHw, cls("Base", { produced: false })], [])
      .map((o) => o.className)).toEqual(["Base"]);
  });

  it("keeps a class with a syntactic diagnostic of any code while the check is ok, and lists it as loose", () => {
    for (const code of [1005, 1155, 1109, 2304, 9999]) {
      const errs = [gateError({ file: "src/A.ts", code, syntactic: true })];
      const a = cls("A", { bundler: OK });
      expect(decideClassOmissions(errs, [a], [])).toEqual([]);
      expect(looseClasses(errs, [a], []).map((l) => l.className)).toEqual(["A"]);
    }
  });

  it("omits the same diagnostic with syntax-error when the guard could not run (no check)", () => {
    const errs = [gateError({ file: "src/A.ts", line: 4, code: 1005, message: "bad", syntactic: true })];
    expect(decideClassOmissions(errs, [cls("A")], [])[0].reason).toEqual({ kind: "syntax-error", count: 1, firstLine: 4, firstMessage: "bad" });
  });

  it("does not omit for an unresolved import the transform removed, and omits for one that survives", () => {
    const err = gateError({ file: "src/A.ts", line: 3, code: 2307, specifier: "./Nope" });
    const removed = cls("A", { bundler: { verdict: { ok: true }, imports: [] } });
    expect(decideClassOmissions([err], [removed], [])).toEqual([]);
    const kept = cls("A", { bundler: { verdict: { ok: true }, imports: [{ specifier: "./Nope", names: ["X"] }] } });
    expect(decideClassOmissions([err], [kept], [])[0].reason).toEqual({ kind: "unresolved-import", specifier: "./Nope", line: 3 });
  });

  it("omits for a missing export only when the import survives (unused and type-only imports omit nothing)", () => {
    const names = [imp("IThing", "p.IThing", "./IThing", 4)];
    const mk = (bundler: BundlerCheckData) => cls("p.User", { importsQualified: ["p.IThing"], importedNames: names, bundler });
    // Unused or type-only: the transform dropped the whole import.
    expect(decideClassOmissions([], [iface, mk({ verdict: { ok: true }, imports: [] })], [])).toEqual([]);
    // The import stays but without this name.
    expect(decideClassOmissions([], [iface, mk({ verdict: { ok: true }, imports: [{ specifier: "./IThing", names: ["Other"] }] })], [])).toEqual([]);
    // The import stays with the name, or as a namespace import.
    for (const n of ["IThing", "*"]) {
      const r = decideClassOmissions([], [iface, mk({ verdict: { ok: true }, imports: [{ specifier: "./IThing", names: [n] }] })], []);
      expect(r.map((o) => o.reason)).toEqual([{ kind: "missing-export", name: "IThing", target: "p.IThing", line: 4 }]);
    }
  });

  it("propagates along a surviving import of an omitted class and not along a removed one", () => {
    const base = cls("Gone", { produced: false });
    const edges = [{ target: "Gone", specifier: "./Gone" }];
    const user = (imports: BundlerCheckData["imports"]) =>
      cls("U", { importsQualified: ["Gone"], importEdges: edges, bundler: { verdict: { ok: true }, imports } });
    expect(decideClassOmissions([], [base, user([{ specifier: "./Gone", names: ["Gone"] }])], []).map((o) => [o.className, o.reason.kind])).toEqual([
      ["Gone", "emit-failed"],
      ["U", "imports-omitted"],
    ]);
    expect(decideClassOmissions([], [base, user([])], []).map((o) => o.className)).toEqual(["Gone"]);
  });

  it("extends still propagates when the check is ok", () => {
    const r = decideClassOmissions([], [cls("Gone", { produced: false }), cls("U", { extendsQualified: "Gone", bundler: OK })], []);
    expect(r.map((o) => o.reason.kind)).toEqual(["emit-failed", "extends-omitted"]);
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

