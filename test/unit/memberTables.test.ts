import { describe, expect, it } from "vitest";
import { buildMemberTables, chainEnd, lookupMember, lookupStatic } from "../../src/translate/memberTables";
import { SHIM_MEMBER_TABLE } from "../../src/translate/shimMembers.generated";
import { fileFromSource } from "../property/gen/genClassContext";

const build = (...files: Array<[string, string]>) =>
  buildMemberTables(files.map(([q, s]) => fileFromSource(q, s)), SHIM_MEMBER_TABLE);

describe("memberTables", () => {
  it("resolves a base across packages by explicit import", () => {
    const t = build(
      ["a.Base", "package a { public class Base { public var x:int; public static const K:int = 1; } }"],
      ["b.Sub", "package b { import a.Base; public class Sub extends Base { } }"],
    );
    expect(t.classes.get("b.Sub")!.base).toEqual({ kind: "translated", qualified: "a.Base" });
    expect(lookupMember(t, "b.Sub", "x")).toEqual({ rule: "translated-super", owner: "a.Base", kind: "field" });
    expect(lookupStatic(t, "b.Sub", "K")).toEqual({ rule: "inherited-static", owner: "a.Base", kind: "constant" });
  });

  it("resolves a base in the same package and by wildcard", () => {
    const t = build(
      ["p.Base", "package p { public class Base { } }"],
      ["p.Same", "package p { public class Same extends Base { } }"],
      ["q.Wild", "package q { import p.*; public class Wild extends Base { } }"],
    );
    expect(t.classes.get("p.Same")!.base).toEqual({ kind: "translated", qualified: "p.Base" });
    expect(t.classes.get("q.Wild")!.base).toEqual({ kind: "translated", qualified: "p.Base" });
  });

  it("gives unknown for a base with no source and no Shim class, shim for a Shim class", () => {
    const t = build(
      ["U", "package { public class U extends Nowhere { } }"],
      ["S", "package { import flash.display.MovieClip; public class S extends MovieClip { } }"],
    );
    expect(chainEnd(t, "U")).toEqual({ kind: "unknown", name: "Nowhere" });
    expect(chainEnd(t, "S")).toEqual({ kind: "shim", name: "MovieClip" });
    expect(lookupMember(t, "S", "gotoAndStop")).toMatchObject({ rule: "shim", owner: "MovieClip" });
    expect(lookupMember(t, "S", "stage")).toMatchObject({ rule: "shim", owner: "DisplayObject" });
  });

  it("ends a cycle with unknown", () => {
    const t = build(
      ["A", "package { public class A extends B { } }"],
      ["B", "package { public class B extends A { } }"],
    );
    expect(chainEnd(t, "A").kind).toBe("unknown");
    expect(lookupMember(t, "A", "nothing")).toBeNull();
  });

  it("an interface contributes nothing", () => {
    const t = build(
      ["I", "package { public interface I { function foo():void; } }"],
      ["C", "package { public class C implements I { } }"],
    );
    expect(t.classes.has("I")).toBe(false);
    expect(lookupMember(t, "C", "foo")).toBeNull();
  });

  it("leaves an unsupported member out of the table", () => {
    const t = build(["C", "package { public class C { public var ok:int; public var xml:XML = <a/>; } }"]);
    const c = t.classes.get("C")!;
    expect(c.instance.has("ok")).toBe(true);
    expect(c.instance.has("xml")).toBe(false);
    expect(lookupMember(t, "C", "xml")).toBeNull();
  });

  it("a nearer declaration decides, the instance member wins within one class", () => {
    const t = build(
      ["B", "package { public class B { public function v():void {} } }"],
      ["C", "package { public class C extends B { public static function v():void {} } }"],
    );
    expect(lookupMember(t, "C", "v")).toMatchObject({ rule: "own-static" });
  });
});
