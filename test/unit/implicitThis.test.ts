import { describe, expect, it } from "vitest";
import { AS3_GLOBALS, isReference, resolveIdentifier } from "../../src/translate/implicitThis";
import type { ResolveEnv } from "../../src/translate/implicitThis";
import { buildMemberTables } from "../../src/translate/memberTables";
import { SHIM_MEMBER_TABLE } from "../../src/translate/shimMembers.generated";
import { tokenize } from "../../src/translate/tokenizer";
import { fileFromSource } from "../property/gen/genClassContext";

function env(files: Array<[string, string]>, self: string, over: Partial<ResolveEnv> = {}): ResolveEnv {
  return {
    tables: buildMemberTables(files.map(([q, s]) => fileFromSource(q, s)), SHIM_MEMBER_TABLE),
    self,
    className: self.slice(self.lastIndexOf(".") + 1),
    isStatic: false,
    locals: new Set(),
    classNames: new Set(),
    bindingOf: (q) => q.slice(q.lastIndexOf(".") + 1),
    ...over,
  };
}

const UI = ["fl.core.UIComponent", "package fl.core { import flash.display.Sprite; public class UIComponent extends Sprite { public static function mergeStyles():void {} protected var inv:int; } }"] as const;
const LB = ["fl.controls.LabelButton", "package fl.controls { import fl.core.UIComponent; public class LabelButton extends UIComponent { public static function other():void {} } }"] as const;

describe("resolveIdentifier", () => {
  it("resolves an inherited static to the declaring class with an import target", () => {
    const r = resolveIdentifier("mergeStyles", 58, env([[...UI], [...LB]], "fl.controls.LabelButton"));
    expect(r).toMatchObject({ kind: "rewrite", text: "UIComponent.mergeStyles", importTarget: "fl.core.UIComponent" });
  });

  it("resolves an own static, an inherited instance and a Shim member", () => {
    const e = env([[...UI], [...LB]], "fl.controls.LabelButton");
    expect(resolveIdentifier("other", 1, e)).toMatchObject({ text: "LabelButton.other", importTarget: null });
    expect(resolveIdentifier("inv", 1, e)).toMatchObject({ text: "this.inv" });
    expect(resolveIdentifier("stage", 1, e)).toMatchObject({ text: "this.stage", found: { rule: "shim" } });
  });

  it("gives the static-context message for an instance member", () => {
    const e = env([[...UI], [...LB]], "fl.controls.LabelButton", { isStatic: true });
    const r = resolveIdentifier("inv", 7, e);
    expect(r).toMatchObject({ kind: "diagnose", diagnostic: { kind: "unresolved-identifier", line: 7 } });
    if (r.kind === "diagnose") expect(r.diagnostic.message).toBe('"inv" is an instance member of LabelButton and cannot be used in a static context');
  });

  it("leaves Dictionary unresolved after a wildcard import of a package without a source (O2)", () => {
    const e = env([["A", "package { import flash.utils.*; import flash.display.Sprite; public class A extends Sprite {} }"]], "A");
    const r = resolveIdentifier("Dictionary", 4, e);
    expect(r).toMatchObject({ kind: "diagnose", diagnostic: { kind: "unresolved-identifier", line: 4 } });
  });

  it("names the base class when the chain ends unknown", () => {
    const e = env([["A", "package { public class A extends Missing {} }"]], "A");
    const r = resolveIdentifier("foo", 2, e);
    if (r.kind !== "diagnose") throw new Error("expected diagnose");
    expect(r.diagnostic.message).toBe('"foo" cannot be resolved: the base class "Missing" of A has neither a source nor a Shim class');
  });

  it("leaves globals, class names and locals alone", () => {
    const e = env([["A", "package { public class A {} }"]], "A", { locals: new Set(["v"]), classNames: new Set(["Sprite"]) });
    expect(resolveIdentifier("Math", 1, e)).toEqual({ kind: "leave", why: "global" });
    expect(resolveIdentifier("Sprite", 1, e)).toEqual({ kind: "leave", why: "class-name" });
    expect(resolveIdentifier("v", 1, e)).toEqual({ kind: "leave", why: "local" });
    expect(AS3_GLOBALS.has("trace")).toBe(true);
  });
});

describe("isReference", () => {
  const refs = (src: string): string[] => {
    const toks = tokenize(src).filter((t) => t.kind !== "comment");
    return toks.map((_, i) => i).filter((i) => isReference(toks, i)).map((i) => toks[i]!.text);
  };

  it("skips member names, keywords, object keys and type arguments", () => {
    expect(refs("a.b + this.c")).toEqual(["a"]);
    expect(refs("x = {k: v, m: w}")).toEqual(["x", "v", "w"]);
    expect(refs("c ? p : q")).toEqual(["c", "p", "q"]);
    expect(refs("new Vector.<Foo>(a, b)")).toEqual(["Vector", "a", "b"]);
    expect(refs("o is Foo")).toEqual(["o"]);
  });
});
