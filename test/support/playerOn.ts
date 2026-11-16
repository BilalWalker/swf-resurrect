import type { ManualClock } from "../../template/runtime/clock";
import { Player } from "../../template/runtime/player";
import type { SceneJson, SpriteSymbol } from "../../template/runtime/scene";
import { FakeBackend } from "./fakeBackend";

/** A Player with an empty root clip on `clock`. */
export function playerOn(clock: ManualClock): Player {
  const rootSym: SpriteSymbol = { type: "sprite", frameCount: 1, frames: [[]], labels: [] };
  const scene: SceneJson = {
    formatVersion: 2,
    stage: { width: 100, height: 100, backgroundColor: "#ffffff", frameRate: 10 },
    rootSymbolId: 0,
    symbols: { "0": rootSym },
  };
  return new Player({ scene, backend: new FakeBackend(), clock, classRegistry: {}, shapeBounds: new Map() });
}

