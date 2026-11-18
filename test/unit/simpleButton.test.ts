import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson } from '../../template/runtime/scene';
import { DisplayObjectContainer } from '../../template/shim/Sprite';
import { Event, MouseEvent } from '../../template/shim/events';
import { SimpleButton, hitOwnerOf } from '../../template/shim/SimpleButton';
import { FakeBackend } from '../support/fakeBackend';

const box = (): DisplayObjectContainer => new DisplayObjectContainer();

describe('SimpleButton states', () => {
  it('holds the four states and keeps only the current one in the render list', () => {
    const [up, over, down, hit] = [box(), box(), box(), box()];
    const b = new SimpleButton(up, over, down, hit);
    expect([b.upState, b.overState, b.downState, b.hitTestState]).toEqual([up, over, down, hit]);
    expect(b._children).toEqual([up]);
    expect(up._parent).toBe(b);
    expect(hit._parent).toBeNull(); // the hit state is not a child
    expect(hitOwnerOf(hit)).toBe(b);

    b._setState('over');
    expect(b._children).toEqual([over]);
    expect(up._parent).toBeNull();
    b._setState('down');
    expect(b._children).toEqual([down]);
  });

  it('replacing the current state object swaps the render list; a null state leaves it empty', () => {
    const up = box();
    const b = new SimpleButton(up);
    const next = box();
    b.upState = next;
    expect(b._children).toEqual([next]);
    b.upState = null;
    expect(b._children).toEqual([]);
    expect(b.mouseChildren).toBe(false);
    expect(b.useHandCursor).toBe(true);
  });

  it('enabled = false draws the up state and takes no mouse event; other events pass', () => {
    const [up, over] = [box(), box()];
    const b = new SimpleButton(up, over);
    b._setState('over');
    expect(b._children).toEqual([over]);
    b.enabled = false;
    expect(b.enabled).toBe(false);
    expect(b._children).toEqual([up]);
    const seen: string[] = [];
    b.addEventListener(MouseEvent.CLICK, () => seen.push('click'));
    b.addEventListener('custom', () => seen.push('custom'));
    b.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
    b.dispatchEvent(new Event('custom'));
    expect(seen).toEqual(['custom']);
    b.enabled = true;
    expect(b._children).toEqual([over]);
    b.dispatchEvent(new MouseEvent(MouseEvent.CLICK));
    expect(seen).toEqual(['custom', 'click']);
  });
});

describe('SimpleButton binding', () => {
  class MenuButton extends SimpleButton {
    sawUpInConstructor: boolean;
    constructor() {
      super();
      this.sawUpInConstructor = this.upState !== null;
    }
  }

  const scene = (className?: string): SceneJson => ({
    formatVersion: 4,
    stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      '0': { type: 'sprite', frameCount: 1, frames: [[{ depth: 1, symbolId: 2, matrix: [1, 0, 0, 1, 5, 6], colorTransform: [1, 1, 1, 1, 0, 0, 0, 0], name: 'play' }]], labels: [] },
      '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
      '2': {
        type: 'button',
        ...(className === undefined ? {} : { className }),
        trackAsMenu: true,
        states: { up: [{ depth: 1, symbolId: 1, matrix: [1, 0, 0, 1, 0, 0], colorTransform: [1, 1, 1, 1, 0, 0, 0, 0], name: '' }], over: [], down: [], hit: [] },
      },
    },
  });
  const make = (s: SceneJson, registry: Record<string, new () => SimpleButton> = {}): Player =>
    new Player({ scene: s, backend: new FakeBackend(), clock: new ManualClock(), classRegistry: registry, shapeBounds: new Map([[1, { x: 0, y: 0, width: 10, height: 10 }]]) });

  it('places a button symbol as a SimpleButton, bound to its instance name and placement', () => {
    const player = make(scene());
    const b = player.root.getChildAt(0);
    expect(b).toBeInstanceOf(SimpleButton);
    expect((player.root as unknown as { play: unknown }).play).toBe(b);
    expect(b.name).toBe('play');
    expect([b.x, b.y]).toEqual([5, 6]);
    expect((b as SimpleButton).trackAsMenu).toBe(true);
    expect((b as SimpleButton)._children.length).toBe(1);
  });

  it('instantiates the linked class, with the states built before its own code runs', () => {
    const player = make(scene('MenuButton'), { MenuButton });
    const b = player.root.getChildAt(0) as MenuButton;
    expect(b).toBeInstanceOf(MenuButton);
    expect(b.sawUpInConstructor).toBe(true);
    expect(String(b)).toBe('[object MenuButton]');
  });

  it('falls back to SimpleButton when the linked class is not registered', () => {
    const player = make(scene('Missing'));
    expect(player.root.getChildAt(0)).toBeInstanceOf(SimpleButton);
  });
});
