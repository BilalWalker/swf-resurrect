// This file is an adaptation of the class KeyObject from Spacer (https://github.com/Zabuzard/Spacer, by Zabuzard),
// licensed GPL-3.0. Upstream source commit 52ebaf94760818808f811ac6a3a8e82e416ed086; release SWF: tag v1, commit
// 2c7326cd1ab68f2122f5e15405ec5b689633b882 (see samples/spacer/PROVENANCE.md). Adapted for SWF Resurrect
// (TypeScript, PixiJS). Licence text: handwritten/spacer/LICENSE. These files are GPL-3.0; the rest of the repository is MIT.
import { KeyboardEvent, Stage } from '../shim';

// Differences from the AS3 class (Requirement 20.4, design D15): it does not extend flash.utils.Proxy, which the Shim
// does not have. Its only Proxy override, getProperty (Keyboard constants by name), is never called by Spacer, so it is
// left out. The key-state API (construct, isDown, deconstruct) is unchanged.
export class KeyObject {
  private static stage: Stage | null = null;
  private static keysDown: Set<number> = new Set<number>();

  public constructor(stage: Stage) {
    this.construct(stage);
  }

  public construct(stage: Stage): void {
    KeyObject.stage = stage;
    KeyObject.keysDown = new Set<number>();
    stage.addEventListener(KeyboardEvent.KEY_DOWN, this.keyPressed);
    stage.addEventListener(KeyboardEvent.KEY_UP, this.keyReleased);
  }

  public isDown(keyCode: number): boolean {
    return KeyObject.keysDown.has(keyCode);
  }

  public deconstruct(): void {
    KeyObject.stage?.removeEventListener(KeyboardEvent.KEY_DOWN, this.keyPressed);
    KeyObject.stage?.removeEventListener(KeyboardEvent.KEY_UP, this.keyReleased);
    KeyObject.keysDown = new Set<number>();
    KeyObject.stage = null;
  }

  private keyPressed = (event: KeyboardEvent): void => {
    KeyObject.keysDown.add(event.keyCode);
  };

  private keyReleased = (event: KeyboardEvent): void => {
    KeyObject.keysDown.delete(event.keyCode);
  };
}
