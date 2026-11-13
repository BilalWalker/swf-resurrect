import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AS3_GLOBALS, isReference, resolveIdentifier } from "../../src/translate/implicitThis";
import type { ResolveEnv } from "../../src/translate/implicitThis";
import { buildMemberTables } from "../../src/translate/memberTables";
import { SHIM_MEMBER_TABLE } from "../../src/translate/shimMembers.generated";
import { canonicalClassPath } from "../../src/convert/qualifiedName";
import { planTranslate } from "../../src/translate/planTranslate";
import { tokenize } from "../../src/translate/tokenizer";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import { typeCheckProject } from "../../src/translate/typeCheckGate";
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

// ---- method-value binding (8.6, Requirement 22.13) -------------------------------------------

vi.setConfig({ testTimeout: 60_000 });
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
function readTree(dir: string, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTree(full, prefix + name + "/"));
    else if (name !== ".gitkeep") out.push([prefix + name, readFileSync(full, "utf8").replace(/\r\n/g, "\n")]);
  }
  return out;
}

const scene = (names: string[]) =>
  ({
    formatVersion: 1,
    rootSymbolId: 0,
    symbols: Object.fromEntries(names.map((c, i) => [String(i), { type: "sprite", frames: [], labels: {}, className: c }])),
  }) as never;

const SPRITE = "import flash.display.Sprite;\n";
const tr = (sources: Array<{ className: string; source: string }>, link: string) =>
  planTranslate(sources, scene([link]), tsSyntaxCheck).classes.find((c) => c.className === link)!;
const one = (members: string, head = "public class A extends Sprite"): string =>
  tr([{ className: "A", source: `package {\n${SPRITE}${head} {\n${members}\n}\n}\n` }], "A").text;
const binds = (text: string): string[] => [...text.matchAll(/this\.(\w+) = this\.\1\.bind\(this\);/g)].map((m) => m[1]!);

describe("method-value binding", () => {
  it("rewrites a bare value to this.name with one bind after super", () => {
    const text = one(
      "public function A() { addEventListener(MouseEvent.MOUSE_DOWN, dragPressHandler); }\n" +
        "public function dragPressHandler(e:MouseEvent):void {}",
    );
    expect(text).toContain("this.addEventListener(MouseEvent.MOUSE_DOWN, this.dragPressHandler);");
    expect(binds(text)).toEqual(["dragPressHandler"]);
    expect(text.indexOf("super();")).toBeLessThan(text.indexOf("this.dragPressHandler = this.dragPressHandler.bind(this);"));
  });

  it("binds an explicit this.m passed as a value, and binds once per name", () => {
    const text = one(
      "public function A() { addEventListener(\"x\", this.h); addEventListener(\"y\", h); }\npublic function h(e:Event):void {}",
    );
    expect(binds(text)).toEqual(["h"]);
  });

  it("does not bind a method that is only called or followed by a dot", () => {
    const text = one("public function A() { h(); h.call(null); }\npublic function h():void {}");
    expect(binds(text)).toEqual([]);
  });

  it("does not bind a field, an accessor, a static method or a Shim member", () => {
    const text = one(
      "public var fld:int;\npublic function get acc():int { return 1; }\npublic static function sm():void {}\n" +
        "public function A() { g(fld); g(acc); g(sm); g(play); }",
    );
    expect(binds(text)).toEqual([]);
    expect(text).not.toContain("bind");
  });

  it("binds an inherited translated method in the referencing class", () => {
    const sources = [
      { className: "B", source: `package {\n${SPRITE}public class B extends Sprite { public function hb(e:Event):void {} }\n}\n` },
      { className: "A", source: "package {\npublic class A extends B { public function A() { addEventListener(\"x\", hb); } }\n}\n" },
    ];
    expect(binds(tr(sources, "A").text)).toEqual(["hb"]);
  });

  it("orders binds by declaration: own methods first, then the nearest base, regardless of reference order", () => {
    const sources = [
      {
        className: "C",
        source: `package {\n${SPRITE}public class C extends Sprite { public function c1():void {} public function c2():void {} }\n}\n`,
      },
      { className: "B", source: "package {\npublic class B extends C { public function b1():void {} public function b2():void {} }\n}\n" },
      {
        className: "A",
        source:
          "package {\npublic class A extends B {\npublic function A() { g(c2); g(b2); g(a2); g(c1); g(b1); g(a1); }\n" +
          "public function a1():void {}\npublic function a2():void {}\n}\n}\n",
      },
    ];
    expect(binds(tr(sources, "A").text)).toEqual(["a1", "a2", "b1", "b2", "c1", "c2"]);
  });

  it("gives a class without a constructor the forwarding constructor, with no TS2556", () => {
    const sources = [
      {
        className: "Base",
        source: `package {\n${SPRITE}public class Base extends Sprite { public function Base(a:int, b:String) {} }\n}\n`,
      },
      {
        className: "Derived",
        source: "package {\npublic class Derived extends Base { public function go():void { g(h); }\npublic function h():void {} }\n}\n",
      },
    ];
    const derived = tr(sources, "Derived").text;
    expect(derived).toContain("public constructor(...args: ConstructorParameters<typeof Base>) {");
    expect(derived).toContain("super(...args);");
    const files = new Map(readTree(join(repoRoot, "template")));
    const plan = planTranslate(sources, scene(["Derived"]), tsSyntaxCheck);
    for (const c of plan.classes) files.set(`src/${c.className}.ts`, c.text);
    const { errors } = typeCheckProject({ files, repoRoot });
    expect(errors.filter((e) => e.code === 2556)).toEqual([]);
  });
});

// ---- fixture lines that motivated Requirement 22 (8.7, Requirement 22.10) --------------------
// Sources below reproduce the shape of Interactivity3.as and click_block MainTimeline.as (not copies of the files).
const INTERACTIVITY3 = [
  "package code {",
  "  import flash.display.MovieClip;",
  "  import flash.events.Event;",
  "  import flash.events.MouseEvent;",
  "  public class Interactivity3 extends MovieClip {",
  "    public var joystick:MovieClip;",
  "    public var initx:Number = 0;",
  "    public var inity:Number = 0;",
  "    public var dragging:Boolean = false;",
  "    public function Interactivity3() {",
  "      super();",
  "      initx = joystick.x;",
  "      inity = joystick.y;",
  "      joystick.addEventListener(MouseEvent.MOUSE_DOWN, dragPressHandler);",
  "      stage.addEventListener(MouseEvent.MOUSE_UP, dragReleaseHandler);",
  "      addEventListener(Event.ENTER_FRAME, enterFrameHandler);",
  "    }",
  "    protected function dragPressHandler(e:MouseEvent):void { dragging = true; }",
  "    protected function dragReleaseHandler(e:MouseEvent):void { dragging = false; }",
  "    protected function enterFrameHandler(e:Event):void {",
  "      with (joystick) { rotation = 1; }",
  "    }",
  "  }",
  "}",
  "",
].join("\n");
const CLICK_BLOCK = [
  "package test_fla {",
  "  import flash.display.MovieClip;",
  "  import flash.events.MouseEvent;",
  "  public dynamic class MainTimeline extends MovieClip {",
  "    public function MainTimeline() {",
  "      super();",
  "    }",
  "    public function clickHandler(e:*):* {",
  '      trace("Clicked at " + mouseX + ", " + mouseY);',
  "    }",
  "  }",
  "}",
  "",
].join("\n");
const FORBIDDEN = new Set([2663, 2662, 2552, 2304]);
function gateOf(sources: Array<{ className: string; source: string }>, link: string) {
  const plan = planTranslate(sources, scene([link]), tsSyntaxCheck);
  const files = new Map(readTree(join(repoRoot, "template")));
  const pathOf = (q: string) => canonicalClassPath(q);
  for (const c of plan.classes) files.set(pathOf(c.className), c.text);
  const cls = plan.classes.find((c) => c.className === link)!;
  const { errors } = typeCheckProject({ files, repoRoot });
  return { cls, errors: errors.filter((e) => e.file === pathOf(cls.className)) };
}
describe("fixture lines through the real gate (Requirement 22.10)", () => {
  it("Interactivity3: bare stage, own fields and own methods resolve; only the with statement stays reported", () => {
    const { cls, errors } = gateOf([{ className: "code.Interactivity3", source: INTERACTIVITY3 }], "code.Interactivity3");
    expect(cls.text).toContain("this.initx = this.joystick.x;");
    expect(cls.text).toContain("this.stage.addEventListener(MouseEvent.MOUSE_UP, this.dragReleaseHandler);");
    expect(cls.text).toContain("this.joystick.addEventListener(MouseEvent.MOUSE_DOWN, this.dragPressHandler);");
    expect(binds(cls.text).sort()).toEqual(["dragPressHandler", "dragReleaseHandler", "enterFrameHandler"]);
    expect(errors.filter((e) => FORBIDDEN.has(e.code))).toEqual([]);
    expect(cls.diagnostics.filter((d) => d.kind === "unsupported-construct").map((d) => d.message).join("\n")).toMatch(/with/);
  });
  it("click_block MainTimeline: bare mouseX and mouseY resolve to this", () => {
    const { cls, errors } = gateOf([{ className: "test_fla.MainTimeline", source: CLICK_BLOCK }], "test_fla.MainTimeline");
    expect(cls.text).toContain("this.mouseX");
    expect(cls.text).toContain("this.mouseY");
    expect(errors.filter((e) => FORBIDDEN.has(e.code))).toEqual([]);
  });
});

// ---- Requirement 30.3: a rolled-back statement leaves no forced import (20.3) ----------------
describe("forced imports and statement rollback", () => {
  const base = { className: "fl.core.UIComponent", source: UI[1] };
  const mid = {
    className: "fl.core.Mid",
    source: "package fl.core { public class Mid extends UIComponent {} }",
  };
  const leaf = (body: string) => ({
    className: "fl.controls.Leaf",
    source: `package fl.controls { import fl.core.Mid; public class Leaf extends Mid { public function go():void { ${body} } } }`,
  });
  const text = (body: string): string =>
    planTranslate([base, mid, leaf(body)], scene(["fl.controls.Leaf"]), tsSyntaxCheck).classes.find(
      (c) => c.className === "fl.controls.Leaf",
    )!.text;

  it("imports the declaring class when the inherited static is used in a kept statement", () => {
    const t = text("mergeStyles();");
    expect(t).toContain("UIComponent.mergeStyles()");
    expect(t).toMatch(/^import \{ UIComponent \}/m);
  });

  it("adds no import when the only user falls back to // AS3: comments", () => {
    const t = text("for (var i:int = mergeStyles(); int(); i++) {}");
    expect(t).toContain("// AS3:");
    expect(t).not.toMatch(/^import .*UIComponent/m);
  });
});