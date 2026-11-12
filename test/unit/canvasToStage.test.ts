import { describe, expect, it } from 'vitest';
import { canvasToStage } from '../../template/runtime/canvasToStage';

const stage = { width: 550, height: 400 };

describe('canvasToStage', () => {
  it('is the identity for an unscaled canvas at the origin', () => {
    expect(canvasToStage({ clientX: 10, clientY: 20 }, { left: 0, top: 0, width: 550, height: 400 }, stage)).toEqual({
      x: 10,
      y: 20,
    });
  });

  it('scales a CSS-scaled canvas', () => {
    const p = canvasToStage({ clientX: 100, clientY: 50 }, { left: 0, top: 0, width: 275, height: 200 }, stage);
    expect(p).toEqual({ x: 200, y: 100 });
  });

  it('subtracts the rect offset', () => {
    const p = canvasToStage({ clientX: 130, clientY: 70 }, { left: 30, top: 20, width: 550, height: 400 }, stage);
    expect(p).toEqual({ x: 100, y: 50 });
  });

  it('maps the edges to 0 and the stage size, and keeps fractions', () => {
    const rect = { left: 5, top: 5, width: 300, height: 300 };
    expect(canvasToStage({ clientX: 5, clientY: 5 }, rect, stage)).toEqual({ x: 0, y: 0 });
    const end = canvasToStage({ clientX: 305, clientY: 305 }, rect, stage);
    expect(end).toEqual({ x: 550, y: 400 });
    const mid = canvasToStage({ clientX: 6, clientY: 6 }, rect, stage);
    expect(mid!.x).toBeCloseTo(550 / 300, 10);
    expect(mid!.y).toBeCloseTo(400 / 300, 10);
  });

  it('returns null for an empty rect', () => {
    expect(canvasToStage({ clientX: 1, clientY: 1 }, { left: 0, top: 0, width: 0, height: 10 }, stage)).toBeNull();
    expect(canvasToStage({ clientX: 1, clientY: 1 }, { left: 0, top: 0, width: 10, height: 0 }, stage)).toBeNull();
  });
});
