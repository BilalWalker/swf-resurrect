// Stage members (as3-coverage task 9.2).
// Validates: Requirements 8.1 to 8.6
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { StageScaleMode } from '../../template/shim';
import { takeNamedLimits } from '../../template/shim/internal';
import { Sprite } from '../../template/shim/Sprite';
import { playerOn } from '../support/playerOn';

describe('Stage members', () => {
  it('defaults: focus null, scaleMode showAll, pointer at 0,0', () => {
    const { stage } = playerOn(new ManualClock());
    expect(stage.focus).toBeNull();
    expect(stage.scaleMode).toBe(StageScaleMode.SHOW_ALL);
    expect([stage.mouseX, stage.mouseY]).toEqual([0, 0]);
  });
  it('focus accepts an InteractiveObject, null or the Stage itself', () => {
    const { stage } = playerOn(new ManualClock());
    expect(() => {
      stage.focus = stage;
    }).not.toThrow();
    expect(stage.focus).toBe(stage);
    const s = new Sprite();
    stage.focus = s;
    expect(stage.focus).toBe(s);
    stage.focus = null;
    expect(stage.focus).toBeNull();
  });
  it('scaleMode is stored and recorded as a Named_Limit', () => {
    const { stage } = playerOn(new ManualClock());
    takeNamedLimits();
    stage.scaleMode = StageScaleMode.NO_SCALE;
    expect(stage.scaleMode).toBe('noScale');
    expect(takeNamedLimits().map((l) => l.id)).toEqual(['stage-scaleMode']);
  });
  it('StageScaleMode has the four values', () => {
    expect([StageScaleMode.NO_SCALE, StageScaleMode.SHOW_ALL, StageScaleMode.EXACT_FIT, StageScaleMode.NO_BORDER]).toEqual([
      'noScale',
      'showAll',
      'exactFit',
      'noBorder',
    ]);
  });
  it('mouseX and mouseY follow the last pointer position', () => {
    const player = playerOn(new ManualClock());
    player.dispatchMouseMove(12, 34);
    expect([player.stage.mouseX, player.stage.mouseY]).toEqual([12, 34]);
  });
});
