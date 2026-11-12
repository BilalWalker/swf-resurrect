import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
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
});
