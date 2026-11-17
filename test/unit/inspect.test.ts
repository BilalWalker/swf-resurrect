// The inspection hook returns plain copies and has no setter (as3-coverage task 20.1, Requirement 25.4).
// Validates: Requirements 25.4
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import { type MovieClip, Sprite } from '../../template/shim';
import { FakeBackend } from '../support/fakeBackend';
import { playerOn } from '../support/playerOn';

describe('Player.inspect', () => {
  it('lists the Stage children as plain data and finds by class name', () => {
    const player = playerOn(new ManualClock());
    const s = new Sprite();
    s.x = 12;
    s.y = 7;
    s.rotation = 30;
    s.name = 'ship';
    player.stage.addChild(s);
    const view = player.inspect();
    expect(view.stageChildren().map((c) => c.className)).toEqual(['MovieClip', 'Sprite']);
    expect(view.find('Sprite')).toEqual([{ className: 'Sprite', name: 'ship', x: 12, y: 7, rotation: 30, visible: true, frame: 0, label: '', children: [] }]);
    expect(view.timers()).toEqual([]);
  });

  it('gives a multi-scene root its scene-relative frame and the label of its absolute frame', () => {
    const empty = { type: 'sprite' as const, frameCount: 1, frames: [[]], labels: [] };
    const rootSym = {
      type: 'sprite' as const,
      frameCount: 3,
      frames: [[], [], []],
      labels: [{ frame: 1, name: 'title' }, { frame: 3, name: 'level' }],
      scenes: [{ name: 'A', firstFrame: 1 }, { name: 'B', firstFrame: 2 }],
    };
    const player = new Player({
      scene: { formatVersion: 3, stage: { width: 10, height: 10, backgroundColor: '#ffffff', frameRate: 10 }, rootSymbolId: 0, symbols: { '0': rootSym, '1': empty } },
      backend: new FakeBackend(),
      clock: new ManualClock(),
      classRegistry: {},
      shapeBounds: new Map(),
    });
    const root = (): { frame: number; label: string } => player.inspect().stageChildren()[0]!;
    expect(root()).toMatchObject({ frame: 1, label: 'title' });
    (player.stage.getChildAt(0) as unknown as MovieClip).gotoAndStop(2, 'B'); // absolute frame 3, scene-relative 2
    expect(root()).toMatchObject({ frame: 2, label: 'level' });
  });

  it('returns copies: changing a result changes no game state', () => {
    const clock = new ManualClock();
    const player = playerOn(clock);
    const s = new Sprite();
    s.x = 5;
    player.stage.addChild(s);
    const first = player.inspect().find('Sprite')[0]!;
    first.x = 999;
    first.visible = false;
    player.inspect().stageChildren().length = 0;
    expect(s.x).toBe(5);
    expect(s.visible).toBe(true);
    expect(player.inspect().stageChildren()).toHaveLength(2);
    expect(player.inspect().tick).toBe(0);
    clock.advance(player.frameIntervalMs);
    player.update();
    expect(player.inspect().tick).toBe(1);
  });
});
