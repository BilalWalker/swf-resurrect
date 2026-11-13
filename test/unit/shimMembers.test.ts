import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ShimDeclarationError, extractShimMembers, parseShimMembersTs, renderShimMembersTs } from "../../src/translate/shimMembers";

function readShim() {
  return readdirSync("template/shim")
    .filter((f) => f.endsWith(".ts"))
    .map((path) => ({ path, text: readFileSync(`template/shim/${path}`, "utf8") }));
}
const names = (t: ReturnType<typeof extractShimMembers>, cls: string) => t[cls]!.members.map((m) => m.name);

describe("extractShimMembers on the current Shim", () => {
  const table = extractShimMembers(readShim());
  it("lists the exported classes and their chains", () => {
    expect(Object.keys(table)).toEqual(["DisplayObject", "DisplayObjectContainer", "Event", "EventDispatcher", "MouseEvent", "MovieClip", "Shape", "Sprite", "Stage"]);
    expect(table.MovieClip!.extends).toBe("Sprite");
    expect(table.EventDispatcher!.extends).toBeNull();
  });
  it("has the MovieClip members and the DisplayObject ones they come with", () => {
    expect(names(table, "MovieClip")).toEqual(expect.arrayContaining(["play", "currentFrame"]));
    expect(names(table, "DisplayObject")).toEqual(expect.arrayContaining(["stage", "mouseX", "mouseY"]));
    expect(table.DisplayObject!.members.find((m) => m.name === "stage")!.kind).toBe("property");
  });
  it("takes Event.type from the constructor parameter property", () => {
    expect(table.Event!.members).toContainEqual({ name: "type", kind: "property" });
  });
  it("leaves out private, underscore and static members", () => {
    expect(names(table, "EventDispatcher")).not.toContain("listeners");
    expect(names(table, "EventDispatcher")).not.toContain("_deliver");
    expect(names(table, "MovieClip")).not.toContain("goto");
    expect(names(table, "Event")).not.toContain("ENTER_FRAME");
    for (const c of Object.values(table)) for (const m of c.members) expect(m.name.startsWith("_")).toBe(false);
  });
  it("round-trips through the generated text", () => {
    expect(parseShimMembersTs(renderShimMembersTs(table))).toEqual(table);
  });
});

describe("extractShimMembers errors", () => {
  const index = (names: string) => ({ path: "index.ts", text: `export { ${names} } from './X';` });
  it("throws with file:line for a computed member name", () => {
    const x = { path: "X.ts", text: "export class A {\n  ok = 1;\n  [Symbol.iterator]() {}\n}\n" };
    expect(() => extractShimMembers([x, index("A")])).toThrow(ShimDeclarationError);
    expect(() => extractShimMembers([x, index("A")])).toThrow("X.ts:3:");
  });
  it("throws for an unbalanced class body", () => {
    const x = { path: "X.ts", text: "export class A {\n  m() {\n" };
    expect(() => extractShimMembers([x, index("A")])).toThrow(/^X\.ts:\d+:/);
  });
  it("throws when an extends chain reaches a class the Shim does not declare", () => {
    const x = { path: "X.ts", text: "export class A extends Base {}\n" };
    expect(() => extractShimMembers([x, index("A")])).toThrow("X.ts:1:");
  });
  it("treats members as the same class text: comments and strings do not count", () => {
    const x = { path: "X.ts", text: "// private z\nexport class A {\n  /* class B { q } */ a = '}';\n  get b(): number { return 1; }\n  set b(v: number) {}\n}\n" };
    expect(extractShimMembers([x, index("A")])).toEqual({
      A: { extends: null, members: [{ name: "a", kind: "property" }, { name: "b", kind: "property" }] },
    });
  });
});
