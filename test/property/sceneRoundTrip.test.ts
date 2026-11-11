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

  // Feature: vertical-slice, Property 1: Scene_JSON round trip
  // **Validates: Requirements 4.6, 10.1**
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
