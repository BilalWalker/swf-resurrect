// Code-drawn fills are hit targets, strokes are not (Runtime, Named_Limit graphics-stroke-not-hit).
// Validates: Requirements 14.1, 7.6
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson } from '../../template/runtime/scene';
import { takeNamedLimits } from '../../template/shim/errorSink';
import { MouseEvent } from '../../template/shim/events';
import { Sprite } from '../../template/shim/Sprite';
import { FakeBackend } from '../support/fakeBackend';

const scene: SceneJson = {
  formatVersion: 2,
  stage: { width: 200, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
  rootSymbolId: 0,
  symbols: { '0': { type: 'sprite', frameCount: 1, frames: [[]], labels: [] } },
};

function rig() {
  const player = new Player({ scene, backend: new FakeBackend(), clock: new ManualClock(), classRegistry: {}, shapeBounds: new Map() });
  const hits: { on: string; target: unknown }[] = [];
  const watch = (name: string, o: Sprite): void => {
    o.addEventListener(MouseEvent.CLICK, (e: { target: unknown }) => hits.push({ on: name, target: e.target }));
  };
  return { player, hits, watch };
}

describe('graphics hit area', () => {
  it('a Sprite with a filled circle is hit inside, not outside, and the click bubbles to the parent', () => {
    const { player, hits, watch } = rig();
    const parent = new Sprite();
    const s = new Sprite();
    s.x = 100;
    s.y = 50;
    s.graphics.beginFill(0xff0000);
    s.graphics.drawCircle(0, 0, 10);
    s.graphics.endFill();
    parent.addChild(s);
    player.stage.addChild(parent);
    watch('parent', parent);
    watch('s', s);
    player.dispatchClick(105, 50);
    expect(hits.map((h) => h.on)).toEqual(['s', 'parent']);
    expect(hits.every((h) => h.target === s)).toBe(true);
    hits.length = 0;
    player.dispatchClick(120, 50);
    expect(hits).toEqual([]);
  });

  it('a Sprite with a filled polygon is hit inside the polygon only', () => {
    const { player, hits, watch } = rig();
    const s = new Sprite();
    s.graphics.beginFill(0x00ff00);
    s.graphics.moveTo(10, 10);
    s.graphics.lineTo(50, 10);
    s.graphics.lineTo(10, 50);
    s.graphics.endFill();
    player.stage.addChild(s);
    watch('s', s);
    player.dispatchClick(20, 20);
    expect(hits.length).toBe(1);
    player.dispatchClick(45, 45); // inside the bounding box, outside the triangle
    expect(hits.length).toBe(1);
  });

  it('an open stroke is not a hit area and raises graphics-stroke-not-hit', () => {
    takeNamedLimits();
    const { player, hits, watch } = rig();
    const s = new Sprite();
    s.graphics.lineStyle(4, 0x0000ff);
    s.graphics.moveTo(10, 10);
    s.graphics.lineTo(60, 10);
    player.stage.addChild(s);
    watch('s', s);
    player.dispatchClick(30, 10);
    expect(hits).toEqual([]);
    expect(takeNamedLimits().map((l) => l.id)).toContain('graphics-stroke-not-hit');
  });
});
