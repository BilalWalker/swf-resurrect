import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson } from '../../template/runtime/scene';
import { FakeBackend } from '../support/fakeBackend';
import { MouseEvent } from '../../template/shim/events';
import { attachRoot } from '../../template/shim/internal';
import { MovieClip } from '../../template/shim/MovieClip';
import { Sprite, type DisplayObjectContainer } from '../../template/shim/Sprite';
import { Stage } from '../../template/shim/Stage';
import { fcConfig } from './config';

// Feature: breadth, Property 24: Events bubble through the Stage_Object and stage hits reach it
// **Validates: Requirements 19.3, 19.5, 15.5**
describe('Property 24: Events bubble through the Stage_Object and stage hits reach it', () => {
  it('bubbling order is target, ancestors, root, Stage_Object; non-bubbling reaches only the target', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 6 }), fc.boolean(), fc.boolean(), (depth, bubbles, attached) => {
        const stage = new Stage();
        const root = new MovieClip();
        if (attached) attachRoot(stage, root);
        const nodes: DisplayObjectContainer[] = [root];
        for (let i = 0; i < depth; i++) {
          const s = new Sprite();
          nodes[nodes.length - 1]!.addChild(s);
          nodes.push(s);
        }
        const target = nodes[nodes.length - 1]!;
        const log: string[] = [];
        nodes.forEach((n, i) => n.addEventListener('ping', () => log.push(`n${i}`)));
        stage.addEventListener('ping', () => log.push('stage'));
        target.dispatchEvent(new MouseEvent('ping', bubbles));
        const expected = bubbles ? nodes.map((_, i) => `n${i}`).reverse() : [`n${nodes.length - 1}`];
        if (bubbles && attached) expected.push('stage');
        expect(log).toEqual(expected);
        expect(target.stage).toBe(attached ? stage : null);
      }),
      fcConfig,
    );
  });

  it('a point no shape contains is delivered to the Stage_Object and to no clip', () => {
    const at = (depth: number, tx: number): DisplayListEntry => ({
      depth,
      symbolId: 1,
      matrix: [1, 0, 0, 1, tx, 0],
      colorTransform: [1, 1, 1, 1, 0, 0, 0, 0],
      name: '',
    });
    const scene: SceneJson = {
      formatVersion: 2,
      stage: { width: 300, height: 300, backgroundColor: '#ffffff', frameRate: 10 },
      rootSymbolId: 0,
      symbols: {
        '0': { type: 'sprite', frameCount: 1, frames: [[at(1, 0), at(2, 100)]], labels: [] },
        '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
      },
    };
    const types = ['mouseMove', 'mouseDown', 'mouseUp', 'click'] as const;
    fc.assert(
      fc.property(fc.integer({ min: 41, max: 99 }), fc.integer({ min: 31, max: 300 }), fc.constantFrom(...types), (x, y, kind) => {
        const player = new Player({
          scene,
          backend: new FakeBackend(),
          clock: new ManualClock(),
          classRegistry: {},
          shapeBounds: new Map([[1, { x: 0, y: 0, width: 40, height: 30 }]]),
        });
        const stageHits: unknown[] = [];
        let clipHits = 0;
        for (const t of types) {
          player.stage.addEventListener(t, (e) => stageHits.push(e.target));
          for (const o of [player.root, ...player.root._children]) o.addEventListener(t, () => clipHits++);
        }
        if (kind === 'mouseMove') player.dispatchMouseMove(x, y);
        else if (kind === 'mouseDown') player.dispatchMouseDown(x, y);
        else player.dispatchClick(x, y);
        expect(clipHits).toBe(0);
        expect(stageHits.length).toBeGreaterThan(0);
        for (const t of stageHits) expect(t).toBe(player.stage);
      }),
      fcConfig,
    );
  });
});
