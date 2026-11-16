import { describe, expect, it } from "vitest";
import { ManualClock } from "../../template/runtime/clock";
import { KeyboardEvent } from "../../template/shim";
import { Sprite } from "../../template/shim/Sprite";
import { playerOn } from "../support/playerOn";

// as3-coverage 8.2, Requirements 5.1 to 5.4, 5.6, 5.9: FakeBackend and a manual clock, no browser.
describe("Player.dispatchKey", () => {
  function setup() {
    const player = playerOn(new ManualClock());
    const seenAtStage: Array<[string, number, unknown]> = [];
    for (const t of [KeyboardEvent.KEY_DOWN, KeyboardEvent.KEY_UP]) {
      player.stage.addEventListener(t, (e) => seenAtStage.push([e.type, (e as KeyboardEvent).keyCode, e.target]));
    }
    return { player, seenAtStage };
  }

  it("dispatches at the Stage when focus is null", () => {
    const { player, seenAtStage } = setup();
    player.dispatchKey(KeyboardEvent.KEY_DOWN, 65);
    expect(seenAtStage).toEqual([["keyDown", 65, player.stage]]);
  });

  it("dispatches at a focused display object on the stage and bubbles to the Stage", () => {
    const { player, seenAtStage } = setup();
    const kid = new Sprite();
    player.root.addChild(kid);
    const atKid: number[] = [];
    kid.addEventListener(KeyboardEvent.KEY_UP, (e) => atKid.push((e as KeyboardEvent).keyCode));
    player.stage.focus = kid;
    player.dispatchKey(KeyboardEvent.KEY_UP, 87);
    expect(atKid).toEqual([87]);
    expect(seenAtStage).toEqual([["keyUp", 87, kid]]);
  });

  it("falls back to the Stage when the focused object is off the stage", () => {
    const { player, seenAtStage } = setup();
    const off = new Sprite();
    const atOff: number[] = [];
    off.addEventListener(KeyboardEvent.KEY_DOWN, () => atOff.push(1));
    player.stage.focus = off;
    player.dispatchKey(KeyboardEvent.KEY_DOWN, 32);
    expect(atOff).toEqual([]);
    expect(seenAtStage).toEqual([["keyDown", 32, player.stage]]);
  });

  it("accepts the Stage itself as focus and delivers each repeat as a further KEY_DOWN", () => {
    const { player, seenAtStage } = setup();
    player.stage.focus = player.stage;
    for (let i = 0; i < 3; i++) player.dispatchKey(KeyboardEvent.KEY_DOWN, 40);
    expect(seenAtStage.length).toBe(3);
  });
});
