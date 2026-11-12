import { describe, it, expect } from 'vitest';
import { parseNumFrames, parseTickOptions, planReplay } from '../../src/verify/core/replayPlan';

describe('parseTickOptions / parseNumFrames', () => {
  it('num_frames only', () => {
    expect(parseTickOptions('num_frames = 32\n')).toEqual({ numFrames: 32, numTicks: null, tickRate: null });
    expect(parseNumFrames('num_frames = 32\n')).toBe(32);
  });
  it('num_ticks only', () => {
    expect(parseNumFrames('num_ticks = 10\r\n')).toBe(10);
  });
  it('both: num_frames wins', () => {
    expect(parseNumFrames('num_ticks = 5\nnum_frames = 7 # c\n')).toBe(7);
  });
  it('neither, or no file', () => {
    expect(parseNumFrames('name = "x"\n')).toBeNull();
    expect(parseNumFrames(null)).toBeNull();
  });
  it('tick_rate present', () => {
    expect(parseTickOptions('tick_rate = 30.5\nnum_frames = 3\n').tickRate).toBe(30.5);
  });
  it('a table header ends the top level', () => {
    expect(parseNumFrames('[player_options]\nnum_frames = 4\n')).toBeNull();
  });
  it('clickgoto count of 32 is unchanged; 3_joystick gives 21; slider_component gives 10', () => {
    expect(parseNumFrames('num_frames = 32')).toBe(32);
    expect(parseNumFrames('num_ticks = 21')).toBe(21);
    expect(parseNumFrames('num_ticks = 10')).toBe(10);
  });
});

describe('planReplay tickSource', () => {
  const waits = JSON.stringify([{ type: 'Wait' }, { type: 'Wait' }, { type: 'Wait' }]);
  it('names the key, or input-groups when no count is given', () => {
    const a = planReplay(waits, 5, 'num_ticks');
    const b = planReplay(waits, null);
    if ('error' in a || 'error' in b) throw new Error('plan failed');
    expect(a.tickSource).toBe('num_ticks');
    expect(b.tickSource).toBe('input-groups');
    expect(b.tickCount).toBe(3);
  });
  it('reports one unused-input for the first surplus group', () => {
    const p = planReplay(waits, 1);
    if ('error' in p) throw new Error('plan failed');
    expect(p.problems).toEqual([{ kind: 'unused-input', index: 1 }]);
  });
});
