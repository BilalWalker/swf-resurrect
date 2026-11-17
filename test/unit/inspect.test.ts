// The inspection hook returns plain copies and has no setter (as3-coverage task 20.1, Requirement 25.4).
// Validates: Requirements 25.4
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Sprite } from '../../template/shim';
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
