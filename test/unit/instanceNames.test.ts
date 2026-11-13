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

describe("default instance names", () => {
  const E = (symbolId: number, depth: number, name = ""): any => ({
    depth,
    symbolId,
    matrix: [1, 0, 0, 1, 0, 0],
    colorTransform: [1, 1, 1, 1, 0, 0, 0, 0],
    name,
  });
  const clip = (...frames: any[][]) => ({ type: "sprite", frameCount: frames.length, frames, labels: [] }) as const;
  const shape = (id: number) => ({ type: "shape", file: `${id}.svg`, origin: { x: 0, y: 0 } }) as const;
  const play = (symbols: Record<string, any>): Player =>
    new Player({
      scene: { formatVersion: 1, stage: { width: 100, height: 100, backgroundColor: "#ffffff", frameRate: 10 }, rootSymbolId: 0, symbols } as SceneJson,
      backend: new FakeBackend(),
      clock: new ManualClock(),
      classRegistry: {},
      shapeBounds: new Map([[1, { x: 0, y: 0, width: 10, height: 10 }]]),
    });

  // click_block: root, click_mc (named) holding an unnamed shape, then an unnamed sprite.
  const clickBlock = () =>
    play({
      "0": clip([E(2, 1, "click_mc"), E(3, 2)]),
      "1": shape(1),
      "2": clip([E(1, 1)]),
      "3": clip([]),
    });

  it("numbers the click_block tree depth-first: the unnamed sprite is instance2", () => {
    const root = clickBlock().root as MovieClip & { click_mc: MovieClip };
    expect(root.name).toBe("root1");
    expect(root.click_mc.name).toBe("click_mc");
    expect(root.click_mc.getChildAt(0).name).toBe("instance1");
    expect(root.getChildAt(1).name).toBe("instance2");
    expect(`${root.getChildAt(1)}`).toBe("[object MovieClip]");
  });

  it("restarts the counter in a new Player", () => {
    clickBlock();
    expect(clickBlock().root.getChildAt(1).name).toBe("instance2");
  });

  it("takes no number for a named placement", () => {
    const root = play({ "0": clip([E(2, 1, "a"), E(2, 2, "b"), E(2, 3)]), "2": clip([]) }).root;
    expect(root.getChildAt(0).name).toBe("a");
    expect(root.getChildAt(1).name).toBe("b");
    expect(root.getChildAt(2).name).toBe("instance1");
  });

  it("gives a script-created Sprite the next number (not verified against Ruffle)", () => {
    const player = play({ "0": clip([E(2, 1, "a"), E(2, 2)]), "2": clip([]) });
    expect(player.root.getChildAt(1).name).toBe("instance1");
    const s = new Sprite();
    const sh = new Shape();
    expect(s.name).toBe("instance2");
    expect(sh.name).toBe("instance3");
  });
});