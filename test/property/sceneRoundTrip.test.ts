import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { serialiseScene } from "../../src/convert/sceneJson";
import { parseScene, validateScene } from "../../template/runtime/scene";
import { fcConfig } from "./config";
import { genScene } from "./gen/genScene";

describe("Scene_JSON round trip", () => {
  it("generated scenes satisfy validateScene", () => {
    fc.assert(
      fc.property(genScene, (scene) => {
        validateScene(scene);
      }),
      fcConfig,
    );
  });

  // Feature: breadth, Property 13: Scene_JSON v2 round trip (size on shapes, optional clipDepth on entries)
  // **Validates: Requirements 12.4, 12.5, 15.5**
  it("serialise, parse, deep-equal; second serialise is byte-identical", () => {
    fc.assert(
      fc.property(genScene, (scene) => {
        const text = serialiseScene(scene);
        const parsed = parseScene(text);
        expect(parsed).toEqual(scene);
        expect(serialiseScene(parsed)).toBe(text);
        expect(text.endsWith("\n")).toBe(true);
        expect(text.endsWith("\n\n")).toBe(false);
      }),
      fcConfig,
    );
  });
});
