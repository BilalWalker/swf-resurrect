import fc from "fast-check";
import { describe, it } from "vitest";
import { ManualClock } from "../../template/runtime/clock";
import { KeyboardEvent } from "../../template/shim";
import { Sprite } from "../../template/shim/Sprite";
import { playerOn } from "../support/playerOn";
import { fcConfig } from "./config";

// Feature: as3-coverage, Property 4: Key events reach the right target
/** **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6, 5.9** */
describe("Property 4: Key events reach the right target", () => {
  it("delivers one event per dispatch to the focus when on stage, else to the Stage, and the Stage sees it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.constantFrom("null", "onStage", "offStage"),
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom(KeyboardEvent.KEY_DOWN, KeyboardEvent.KEY_UP),
        (code, focusState, repeats, type) => {
          const player = playerOn(new ManualClock());
          const kid = new Sprite();
          if (focusState === "onStage") player.root.addChild(kid);
          if (focusState !== "null") player.stage.focus = kid;
          const atKid: number[] = [];
          const atStage: Array<{ code: number; target: unknown; type: string }> = [];
          kid.addEventListener(type, (e) => atKid.push((e as KeyboardEvent).keyCode));
          player.stage.addEventListener(type, (e) => atStage.push({ code: (e as KeyboardEvent).keyCode, target: e.target, type: e.type }));
          for (let i = 0; i < repeats; i++) player.dispatchKey(type, code);
          const expectedTarget = focusState === "onStage" ? kid : player.stage;
          return (
            atKid.length === (focusState === "onStage" ? repeats : 0) &&
            atStage.length === repeats &&
            atStage.every((s) => s.code === code && s.type === type && s.target === expectedTarget)
          );
        },
      ),
      fcConfig,
    );
  });
});
