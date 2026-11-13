import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend } from '../support/fakeBackend';

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

function play(symbols: SceneJson['symbols'], registry: Record<string, new () => MovieClip>): Player {
  const scene: SceneJson = {
    formatVersion: 1,
    stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols,
  };
  return new Player({ scene, backend: new FakeBackend(), clock: new ManualClock(), classRegistry: registry, shapeBounds: new Map() });
}

describe('Construction_Bind: constructor-time reads', () => {
  it('a constructor statement reads a child (the shape of Interactivity3, line 34)', () => {
    let seen: unknown;
    class Main extends MovieClip {
      declare joystick: MovieClip;
      constructor() {
        super();
        seen = this.joystick.x;
      }
    }
    play({ '0': clip([[entry(1, 1, 'joystick')]], 'Main'), '1': clip([[]]) }, { Main });
    expect(seen).toBe(7);
  });

  it('a constructor statement assigns a property of a child (the shape of Main, maskee1.mask)', () => {
    class Main extends MovieClip {
      declare maskee1: MovieClip;
      declare mask1: MovieClip;
      constructor() {
        super();
        (this.maskee1 as any).mask = this.mask1; // the Shim has no mask yet; the assignment is the shape of Main
      }
    }
    const p = play({ '0': clip([[entry(1, 1, 'maskee1'), entry(2, 2, 'mask1')]], 'Main'), '1': clip([[]]), '2': clip([[]]) }, { Main });
    expect((p.root as any).maskee1.mask).toBe((p.root as any).mask1);
  });

  it('a TypeScript field initialiser reads a child; super() with arguments still binds', () => {
    class Base extends MovieClip {
      constructor(readonly tag: string) {
        super();
      }
    }
    class Main extends Base {
      declare kid: MovieClip;
      read = (this as any).kid;
      constructor() {
        super('t');
      }
    }
    const p = play({ '0': clip([[entry(1, 1, 'kid')]], 'Main'), '1': clip([[]]) }, { Main });
    expect((p.root as Main).read).toBe((p.root as any).kid);
    expect((p.root as Main).tag).toBe('t');
  });

  it('a child placed only on frame 2 is not bound at construction', () => {
    let seen: unknown = 'unset';
    class Main extends MovieClip {
      constructor() {
        super();
        seen = (this as any).late;
      }
    }
    play({ '0': clip([[], [entry(1, 1, 'late')]], 'Main'), '1': clip([[]]) }, { Main });
    expect(seen).toBeUndefined();
  });

  it('three nested levels: every child constructor ends before its parent body starts', () => {
    const log: string[] = [];
    const mk = (n: string) =>
      class extends MovieClip {
        constructor() {
          super();
          log.push(`body:${n}`);
        }
      };
    play(
      {
        '0': clip([[entry(1, 1, 'a'), entry(2, 4, 'd')]], 'R'),
        '1': clip([[entry(1, 2, 'b')]], 'A'),
        '2': clip([[entry(1, 3, 'c')]], 'B'),
        '3': clip([[]], 'C'),
        '4': clip([[]], 'D'),
      },
      { R: mk('R'), A: mk('A'), B: mk('B'), C: mk('C'), D: mk('D') },
    );
    expect(log).toEqual(['body:C', 'body:B', 'body:A', 'body:D', 'body:R']);
  });
});

describe('Construction_Bind: new Cls() from script (D39)', () => {
  class Part extends MovieClip {}
  class Sub extends Part {}
  class Loose extends MovieClip {}
  const world = () =>
    play({ '0': clip([[]]), '1': clip([[entry(1, 2, 'inner')]], 'Part'), '2': clip([[]]) }, { Part });

  it('a registered class gets the frame-1 children of its symbol', () => {
    world();
    expect((new Part() as any).inner).toBeInstanceOf(MovieClip);
  });

  it('an unregistered subclass gets the children of the nearest registered ancestor', () => {
    world();
    expect((new Sub() as any).inner).toBeInstanceOf(MovieClip);
  });

  it('a class with no map entry has no children', () => {
    world();
    const l = new Loose();
    expect(l.numChildren).toBe(0);
    expect(new MovieClip().numChildren).toBe(0);
  });

  it('a new Cls() inside a constructor body does not take the outer context', () => {
    let made: MovieClip | undefined;
    class Outer extends MovieClip {
      constructor() {
        super();
        made = new Loose();
      }
    }
    play({ '0': clip([[entry(1, 1, 'k')]], 'Outer'), '1': clip([[]]) }, { Outer });
    expect(made!.numChildren).toBe(0);
  });
});

describe('Construction_Bind: the declare pin', () => {
  it('declare keeps the bound child; a plain field erases it (the control)', () => {
    class WithDeclare extends MovieClip {
      declare kid: MovieClip;
    }
    class Plain extends MovieClip {
      kid: MovieClip | undefined;
    }
    const kept = play({ '0': clip([[entry(1, 1, 'kid')]], 'D'), '1': clip([[]]) }, { D: WithDeclare });
    expect((kept.root as any).kid).toBeInstanceOf(MovieClip);
    const erased = play({ '0': clip([[entry(1, 1, 'kid')]], 'P'), '1': clip([[]]) }, { P: Plain });
    expect((erased.root as Plain).kid).toBeUndefined();
  });

  it('the translator keeps declare for an uninitialised class-typed field (clickgoto golden)', () => {
    const golden = readFileSync('test/fixtures/clickgoto/translated/MainTimeline.ts.txt', 'utf8');
    expect(golden).toMatch(/public declare l_button: LeftButton;/);
  });
});