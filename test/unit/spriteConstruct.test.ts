import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { Event } from '../../template/shim/events';
import { MovieClip } from '../../template/shim/MovieClip';
import { Sprite } from '../../template/shim/Sprite';
import { FakeBackend } from '../support/fakeBackend';

// Construction_Bind lives in the Sprite constructor (Requirement 24.1, D24), as in Ruffle. MovieClip inherits it.

const CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
const entry = (depth: number, symbolId: number, name: string): DisplayListEntry => ({
  depth,
  symbolId,
  matrix: [1, 0, 0, 1, 7, 0],
  colorTransform: CT,
  name,
});
const clip = (frames: DisplayListEntry[][], className?: string): SpriteSymbol => ({
  type: 'sprite',
  frameCount: frames.length,
  frames,
  labels: [],
  ...(className === undefined ? {} : { className }),
});

function rig(symbols: SceneJson['symbols'], registry: Record<string, new () => Sprite>): { player: Player; clock: ManualClock } {
  const scene: SceneJson = {
    formatVersion: 1,
    stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols,
  };
  const clock = new ManualClock();
  const player = new Player({ scene, backend: new FakeBackend(), clock, classRegistry: registry, shapeBounds: new Map() });
  return { player, clock };
}

describe('Sprite constructor: frame 1 is built once', () => {
  it('a MovieClip subclass gets each frame-1 child exactly once, and the same objects after the first tick', () => {
    let built = 0;
    class Kid extends MovieClip {
      constructor() {
        super();
        built++;
      }
    }
    class Main extends MovieClip {}
    // Two frames with the same placement: the child is retained, never rebuilt.
    const { player, clock } = rig(
      { '0': clip([[entry(1, 1, 'kid')], [entry(1, 1, 'kid')]], 'Main'), '1': clip([[]], 'Kid') },
      { Main, Kid },
    );
    const root = player.root as MovieClip & { kid: MovieClip };
    expect(built).toBe(1);
    const before = [...root._children];
    const kid = root.kid;
    clock.advance(player.frameIntervalMs);
    player.update();
    expect(root.currentFrame).toBe(2);
    expect(built).toBe(1);
    expect(root._children).toEqual(before);
    expect(root.kid).toBe(kid);
  });

  it('a linked class extending Sprite gets its named children before its field initialisers and its body', () => {
    const seen: Record<string, unknown> = {};
    class Main extends Sprite {
      declare kid: MovieClip;
      early = (this as any).kid;
      constructor() {
        super();
        seen.body = this.kid;
      }
    }
    const { player } = rig({ '0': clip([[entry(1, 1, 'kid')]], 'Main'), '1': clip([[]]) }, { Main });
    const root = player.root as Main;
    expect(root).toBeInstanceOf(Sprite);
    expect(root).not.toBeInstanceOf(MovieClip);
    expect(root.early).toBeInstanceOf(MovieClip);
    expect(seen.body).toBe(root.early);
    expect(root.numChildren).toBe(1);
    expect(root.parent).toBe(player.stage);
  });

  it('new SpriteClass() from script gets the frame-1 children of its symbol; a plain new Sprite() gets none', () => {
    class Holder extends Sprite {
      declare kid: MovieClip;
    }
    let made: Holder | undefined;
    let plain: Sprite | undefined;
    class Main extends MovieClip {
      constructor() {
        super();
        made = new Holder();
        plain = new Sprite();
      }
    }
    rig(
      { '0': clip([[]], 'Main'), '1': clip([[entry(1, 2, 'kid')]], 'Holder'), '2': clip([[]]) },
      { Main, Holder },
    );
    expect(made).toBeInstanceOf(Holder);
    expect(made!.kid).toBeInstanceOf(MovieClip);
    expect(made!.numChildren).toBe(1);
    expect(plain!.numChildren).toBe(0);
  });
});

describe('Sprite in the Player: stepping', () => {
  it('a Sprite gets enterFrame and exitFrame, has no frame scripts, and its MovieClip children still step', () => {
    const log: string[] = [];
    class Main extends Sprite {
      constructor() {
        super();
        this.addEventListener(Event.ENTER_FRAME, () => log.push('enter'));
        this.addEventListener(Event.EXIT_FRAME, () => log.push('exit'));
      }
    }
    const { player, clock } = rig(
      { '0': clip([[entry(1, 1, 'mc')]], 'Main'), '1': clip([[entry(1, 2, 'a')], [entry(1, 2, 'b')]]), '2': clip([[]]) },
      { Main },
    );
    const mc = (player.root as Main & { mc: MovieClip }).mc;
    clock.advance(player.frameIntervalMs);
    player.update();
    expect(log).toEqual(['enter', 'exit']);
    expect(mc.currentFrame).toBe(2);
  });
});
