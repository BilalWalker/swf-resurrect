import { describe, expect, it } from "vitest";
import {
  InvalidClassNameError,
  canonicalClassPath,
  parseQualifiedName,
  qualifiedFromScriptPath,
  relativeSpecifier,
  scriptRelPath,
  shimSpecifier,
} from "../../src/convert/qualifiedName";

describe("parseQualifiedName", () => {
  it("accepts dotted names and the unnamed package", () => {
    expect(parseQualifiedName("fl.controls.Slider")).toEqual({ pkg: ["fl", "controls"], simple: "Slider" });
    expect(parseQualifiedName("Main")).toEqual({ pkg: [], simple: "Main" });
    expect(parseQualifiedName("test_fla.MainTimeline").pkg).toEqual(["test_fla"]);
  });

  it.each(["a..b", "a/b.C", "..", "C:x", "", ".a", "a.", "a\0b", "a\\b"])("rejects %j", (name) => {
    expect(() => parseQualifiedName(name)).toThrow(InvalidClassNameError);
  });

  it("reports code, stage and message", () => {
    try {
      parseQualifiedName("a..b", "unpack");
      expect.unreachable();
    } catch (e) {
      const err = e as InvalidClassNameError;
      expect(err.code).toBe("INVALID_CLASS_NAME");
      expect(err.stage).toBe("unpack");
      expect(err.message).toMatch(/^invalid class name "a\.\.b": /);
    }
  });
});

describe("script and class paths", () => {
  it("maps names to script paths and back", () => {
    expect(scriptRelPath("fl.controls.Slider")).toBe("fl/controls/Slider.as");
    expect(qualifiedFromScriptPath("fl/controls/Slider.as")).toBe("fl.controls.Slider");
    expect(qualifiedFromScriptPath("Main.as")).toBe("Main");
  });

  it("returns null for unsafe or non-.as paths", () => {
    expect(qualifiedFromScriptPath("a/../B.as")).toBeNull();
    expect(qualifiedFromScriptPath("a.b.as")).toBeNull();
    expect(qualifiedFromScriptPath("a/B.txt")).toBeNull();
    expect(qualifiedFromScriptPath("a\\B.as")).toBeNull();
    expect(qualifiedFromScriptPath(".as")).toBeNull();
  });

  it("gives canonical class paths", () => {
    expect(canonicalClassPath("Main")).toBe("src/Main.ts");
    expect(canonicalClassPath("fl.controls.Slider")).toBe("src/fl/controls/Slider.ts");
  });
});

describe("specifiers", () => {
  it("handles depth 0 to 3", () => {
    expect(relativeSpecifier("src/A.ts", "src/B.ts")).toBe("./B");
    expect(relativeSpecifier("src/A.ts", "src/fl/Slider.ts")).toBe("./fl/Slider");
    expect(relativeSpecifier("src/a/A.ts", "src/B.ts")).toBe("../B");
    expect(relativeSpecifier("src/a/A.ts", "src/a/B.ts")).toBe("./B");
    expect(relativeSpecifier("src/a/b/A.ts", "src/core/UIComponent.ts")).toBe("../../core/UIComponent");
    expect(relativeSpecifier("src/a/b/c/A.ts", "src/a/x/B.ts")).toBe("../../x/B");
  });

  it("builds the Shim specifier", () => {
    expect(shimSpecifier("src/X.ts")).toBe("../shim");
    expect(shimSpecifier("src/a/X.ts")).toBe("../../shim");
    expect(shimSpecifier("src/a/b/X.ts")).toBe("../../../shim");
  });
});
