import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { planTranslate } from "../../src/translate/planTranslate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import { typeCheckProject } from "../../src/translate/typeCheckGate";
import { canonicalClassPath } from "../../src/convert/qualifiedName";
import { chainSource, scene, translateAndRun } from "../support/privateChain";

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

describe("private members are per class (colliding names along an extends chain)", () => {
  const sources = [chainSource(0, ["lv", "w"], null), chainSource(1, ["lv"], "C0"), chainSource(2, ["lv", "w"], "C1")];

  it("gives each subclass private a distinct emitted name and keeps the base name", () => {
    const { texts } = translateAndRun(sources);
    expect(texts.get("C0")).toContain("private lv: number = 10;");
    expect(texts.get("C0")).toContain("private pm(): number");
    expect(texts.get("C1")).toContain("private lv$C1: number = 20;");
    expect(texts.get("C1")).toContain("private pm$C1(): number");
    expect(texts.get("C1")).toContain("return this.pm$C1();");
    expect(texts.get("C2")).toContain("this.lv$C2 + this.w$C2");
  });

  it("each class reads back its own value", () => {
    const { classes } = translateAndRun(sources);
    const c = new classes.C2();
    expect(c.read0()).toBe(10 + 11);
    expect(c.read1()).toBe(20);
    expect(c.read2()).toBe(30 + 31);
  });

  it("renames a private field that is read in the arguments of super(...)", () => {
    const { texts, classes } = translateAndRun([
      { className: "B0", source: "package {\n  public class B0 {\n    private var form:int = 1;\n    public var seen:int;\n    public function B0(f:int) { seen = f; }\n    public function baseForm():int { return form; }\n  }\n}\n" },
      { className: "B1", source: "package {\n  public class B1 extends B0 {\n    private var form:int = 7;\n    public function B1() { super(form); }\n    public function ownForm():int { return form; }\n  }\n}\n" },
    ]);
    expect(texts.get("B1")).toContain("this.form$B1 = __super_form;");
    const o = new classes.B1();
    expect([o.seen, o.baseForm(), o.ownForm()]).toEqual([7, 1, 7]);
  });

  it("keeps names unchanged when nothing collides", () => {
    const { texts } = translateAndRun([chainSource(0, ["a"], null), chainSource(1, ["b"], "C0")].map((s, i) =>
      i === 1 ? { ...s, source: s.source.replace("private function pm()", "private function qm()").replace("pm();", "qm();") } : s));
    expect(texts.get("C1")).not.toContain("$");
  });

  it("type-checks without TS2415 (separate declarations of a private property)", () => {
    const plan = planTranslate(sources, scene(["C2"]), tsSyntaxCheck);
    const files = new Map(readTree(join(repoRoot, "template")));
    for (const c of plan.classes) files.set(canonicalClassPath(c.className), c.text);
    const { errors } = typeCheckProject({ files, repoRoot });
    expect(errors.filter((e) => e.code === 2415)).toEqual([]);
  });
});
