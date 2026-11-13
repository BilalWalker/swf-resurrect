import { describe, expect, it } from "vitest";
import { ManualClock } from "../../template/runtime/clock";
import { Player } from "../../template/runtime/player";
import type { SceneJson } from "../../template/runtime/scene";
import { Event } from "../../template/shim/events";
import { MovieClip } from "../../template/shim/MovieClip";
import { Shape } from "../../template/shim/Shape";
import { Sprite } from "../../template/shim/Sprite";
import { Stage } from "../../template/shim/Stage";
import { FakeBackend } from "../support/fakeBackend";

function scene(className?: string): SceneJson {
  return {
    formatVersion: 1,
    stage: { width: 100, height: 100, backgroundColor: "#ffffff", frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      "0": {
        type: "sprite",
        frameCount: 1,
        frames: [[{ depth: 1, symbolId: 2, matrix: [1, 0, 0, 1, 0, 0], colorTransform: [1, 1, 1, 1, 0, 0, 0, 0], name: "child" }]],
        labels: [],
        ...(className === undefined ? {} : { className }),
      },
      "2": { type: "sprite", frameCount: 1, frames: [[]], labels: [] },
    },
  };
}

describe("display object printing", () => {
  it("prints the Shim classes under their own names", () => {
    expect(String(new MovieClip())).toBe("[object MovieClip]");
    expect(`${new Sprite()}`).toBe("[object Sprite]");
    expect(String(new Shape())).toBe("[object Shape]");
    expect(String(new Stage())).toBe("[object Stage]");
  });

  it("prints a class registered by the Player under the last segment of its key", () => {
    class MainTimeline extends MovieClip {}
    const player = new Player({
      scene: scene("test_fla.MainTimeline"),
      backend: new FakeBackend(),
      clock: new ManualClock(),
      classRegistry: { "test_fla.MainTimeline": MainTimeline },
      shapeBounds: new Map(),
    });
    expect(player.root).toBeInstanceOf(MainTimeline);
    expect(String(player.root)).toBe("[object MainTimeline]");
    expect(String((player.root as MovieClip).getChildAt(0))).toBe("[object MovieClip]");
    expect(String(player.stage)).toBe("[object Stage]");
  });

  it("does not read constructor.name", () => {
    class Renamed extends MovieClip {}
    Object.defineProperty(Renamed, "name", { value: "Minified" });
    expect(String(new Renamed())).toBe("[object MovieClip]");
  });

  it("lets a class with its own toString win", () => {
    class Own extends MovieClip {
      override toString(): string {
        return "own";
      }
    }
    expect(String(new Own())).toBe("own");
  });

  it("prints the event target as in Flash", () => {
    const mc = new MovieClip();
    let text = "";
    mc.addEventListener("x", (e: Event) => {
      text = "target: " + e.target;
    });
    mc.dispatchEvent(new Event("x"));
    expect(text).toBe("target: [object MovieClip]");
  });
});
