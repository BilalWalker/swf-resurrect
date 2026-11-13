import { describe, expect, it } from "vitest";
import { childNamesByClass, planTranslate } from "../../src/translate/planTranslate";
import type { SceneJson } from "../../template/runtime/scene";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import { evalTranslated } from "../support/evalTranslated";

const scene = (link: string) =>
  ({
    formatVersion: 1,
    rootSymbolId: 0,
    symbols: { "0": { type: "sprite", frames: [], labels: {}, className: link } },
  }) as unknown as SceneJson;

// The probe base binds its child in its constructor, as the Shim MovieClip constructor does (design 21.1).
const BASE = "package {\n  public class Probe {\n    public function Probe() { this['joystick'] = 'bound'; }\n  }\n}\n";
const kid = (field: string): string =>
  `package {\n  public class Kid extends Probe {\n    ${field}\n  }\n}\n`;

function run(field: string, withMap: boolean) {
  const sources = [
    { className: "Probe", source: BASE },
    { className: "Kid", source: kid(field) },
  ];
  const map = withMap ? new Map([["Kid", new Set(["joystick"])]]) : undefined;
  const plan = planTranslate(sources, scene("Kid"), tsSyntaxCheck, [], map);
  const kidClass = plan.classes.find((c) => c.className === "Kid")!;
  const probe = plan.classes.find((c) => c.className === "Probe")!;
  const probeExports = evalTranslated(probe.text);
  const kidExports = evalTranslated(kidClass.text, { "./Probe": probeExports });
  return { text: kidClass.text, diagnostics: kidClass.diagnostics, value: new kidExports.Kid().joystick };
}

describe("fields named like a timeline child (Requirement 24.10, D38)", () => {
  it("emits declare for a field with no initialiser and keeps the bound child", () => {
    const r = run("public var joystick:Object;", true);
    expect(r.text).toContain("public declare joystick: any;");
    expect(r.value).toBe("bound");
  });

  it("drops an initialiser that is null and emits declare", () => {
    const r = run("public var joystick:Object = null;", true);
    expect(r.text).toContain("public declare joystick: any;");
    expect(r.text).not.toContain("null");
    expect(r.value).toBe("bound");
  });

  it("drops an initialiser that is undefined", () => {
    const r = run("public var joystick:Object = undefined;", true);
    expect(r.text).toContain("public declare joystick: any;");
    expect(r.value).toBe("bound");
  });

  it("control: without the map entry the initialiser stays and overwrites the child", () => {
    const r = run("public var joystick:Object = null;", false);
    expect(r.text).toContain("joystick: any = null;");
    expect(r.value).toBeNull();
  });

  it("keeps a non-null initialiser and reports child-field-initialiser", () => {
    const r = run("public var joystick:Object = {};", true);
    expect(r.text).toContain("joystick: any = {};");
    expect(r.text).not.toContain("declare joystick");
    expect(r.diagnostics.filter((d) => d.kind === "child-field-initialiser")).toHaveLength(1);
  });

  it("leaves a field with another name and a static field of the same name alone", () => {
    const r = run("public var other:int = 3;\n    public static var joystick:int = 1;", true);
    expect(r.text).toContain("other: number = 3;");
    expect(r.text).toContain("static joystick: number = 1;");
    expect(r.diagnostics).toEqual([]);
  });
});

describe("childNamesByClass", () => {
  it("collects the named frame-1 placements of each linked sprite symbol", () => {
    const place = (name: string) => ({ depth: 1, characterId: 2, matrix: [1, 0, 0, 1, 0, 0], colorTransform: [1, 1, 1, 1, 0, 0, 0, 0], name });
    const sc = {
      formatVersion: 1,
      rootSymbolId: 0,
      symbols: {
        "0": { type: "sprite", frameCount: 1, labels: [], frames: [[place("joystick"), place("")]], className: "code.Main" },
        "1": { type: "sprite", frameCount: 2, labels: [], frames: [[], [place("late")]], className: "Kid" },
        "2": { type: "sprite", frameCount: 1, labels: [], frames: [[place("unlinked")]] },
      },
    } as unknown as SceneJson;
    const m = childNamesByClass(sc);
    expect([...m.keys()].sort()).toEqual(["Kid", "code.Main"]);
    expect([...m.get("code.Main")!]).toEqual(["joystick"]);
    expect(m.get("Kid")!.size).toBe(0);
  });
});