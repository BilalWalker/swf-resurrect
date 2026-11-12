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

describe('planReplay pointer entries', () => {
  const plan = (entries: unknown[]) => {
    const p = planReplay(JSON.stringify(entries), null);
    if ('error' in p) throw new Error(p.error);
    return p;
  };
  const move = (x: number, y: number) => ({ type: 'MouseMove', pos: [x, y] });
  const down = (x: number, y: number) => ({ type: 'MouseDown', btn: 'Left', pos: [x, y] });
  const up = (x: number, y: number) => ({ type: 'MouseUp', btn: 'Left', pos: [x, y] });
  const wait = { type: 'Wait' };

  it('a MouseMove does not end an Input_Group (3_joystick and slider_component style)', () => {
    const p = plan([move(10, 10), move(20, 20), down(20, 20), move(40, 40), up(40, 40), wait, move(5, 5)]);
    expect(p.tickCount).toBe(2);
    expect(p.pointers.map((q) => [q.tick, q.kind, q.index])).toEqual([
      [0, 'move', 0],
      [0, 'move', 1],
      [0, 'down', 2],
      [0, 'move', 3],
      [0, 'up', 4],
      [1, 'move', 6],
    ]);
    expect(p.pressReleasePairs).toBe(1);
    expect(p.problems).toEqual([]);
  });

  it('a repeated MouseDown is flagged and still delivered', () => {
    const p = plan([down(1, 1), down(2, 2), up(2, 2)]);
    expect(p.problems).toEqual([{ kind: 'unpaired-mouse-event', index: 1 }]);
    expect(p.pointers.map((q) => [q.kind, q.unpaired])).toEqual([
      ['down', false],
      ['down', true],
      ['up', false],
    ]);
    expect(p.pressReleasePairs).toBe(1);
  });

  it('an unpaired MouseUp is flagged and still delivered', () => {
    const p = plan([up(1, 1)]);
    expect(p.problems).toEqual([{ kind: 'unpaired-mouse-event', index: 0 }]);
    expect(p.pointers).toEqual([{ tick: 0, kind: 'up', x: 1, y: 1, index: 0, unpaired: true }]);
    expect(p.pressReleasePairs).toBe(0);
  });

  it('unsupported entries act as Wait', () => {
    const p = plan([
      { type: 'KeyDown' },
      { type: 'MouseDown', btn: 'Right', pos: [1, 1] },
      { type: 'MouseMove', pos: [1] },
      move(3, 3),
    ]);
    expect(p.problems.map((q) => q.kind)).toEqual(['unsupported-input', 'unsupported-input', 'unsupported-input']);
    expect(p.tickCount).toBe(4);
    expect(p.pointers).toEqual([{ tick: 3, kind: 'move', x: 3, y: 3, index: 3, unpaired: false }]);
  });
});