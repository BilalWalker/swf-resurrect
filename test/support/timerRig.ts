import { ManualClock } from "../../template/runtime/clock";
import { Player } from "../../template/runtime/player";
import type { SceneJson, SpriteSymbol } from "../../template/runtime/scene";
import { FakeBackend } from "./fakeBackend";
/** A Player with an empty root clip at `frameRate` on a manual clock; `advance(ms)` moves the clock and updates. */
export function timerRig(frameRate: number): { clock: ManualClock; player: Player; advance(ms: number): void } {
  const rootSym: SpriteSymbol = { type: "sprite", frameCount: 1, frames: [[]], labels: [] };
  const scene: SceneJson = {
    formatVersion: 3,
    stage: { width: 100, height: 100, backgroundColor: "#ffffff", frameRate },
    rootSymbolId: 0,
    symbols: { "0": rootSym },
  };
  const clock = new ManualClock();
  const player = new Player({ scene, backend: new FakeBackend(), clock, classRegistry: {}, shapeBounds: new Map() });
  return {
    clock,
    player,
    advance(ms: number) {
      clock.advance(ms);
      player.update();
    },
  };
}
