import fc from 'fast-check';
import { describe, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { ArgumentError } from '../../template/shim/errors';
import { Sprite } from '../../template/shim/Sprite';
import type { FakeNode } from '../support/fakeBackend';
import { playerOn } from '../support/playerOn';
import { fcConfig } from './config';

// Feature: as3-coverage, Property 6: Stage children obey container laws
/** **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.7** */
describe('Property 6: Stage children obey container laws', () => {
  it('keeps the root at index 0, rejects non-children and keeps backend order equal to child order', () => {
    const op = fc.oneof(
      fc.record({ k: fc.constant('add' as const), i: fc.nat(5) }),
      fc.record({ k: fc.constant('remove' as const), i: fc.nat(5) }),
      fc.record({ k: fc.constant('removeStranger' as const), i: fc.constant(0) }),
      fc.record({ k: fc.constant('getAt' as const), i: fc.nat(8) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
        const clock = new ManualClock();
        const player = playerOn(clock);
        const pool = Array.from({ length: 6 }, (_, i) => {
          const s = new Sprite();
          s.x = i + 1; // marks the child so its node can be told apart
          return s;
        });
        for (const o of ops) {
          const before = [...player.stage._children];
          if (o.k === 'add') player.stage.addChild(pool[o.i]!);
          else if (o.k === 'remove') {
            const target = pool[o.i]!;
            if (target._parent === player.stage) player.stage.removeChild(target);
            else {
              try {
                player.stage.removeChild(target);
                return false;
              } catch (e) {
                if (!(e instanceof ArgumentError)) return false;
              }
              if (player.stage._children.some((c, i) => c !== before[i]) || before.length !== player.stage._children.length) return false;
            }
          } else if (o.k === 'removeStranger') {
            try {
              player.stage.removeChild(new Sprite());
              return false;
            } catch (e) {
              if (!(e instanceof ArgumentError)) return false;
            }
          } else if (o.i < player.stage.numChildren) {
            if (player.stage.getChildAt(o.i) !== player.stage._children[o.i]) return false;
          }
          if (player.stage._children[0] !== player.root) return false;
        }
        clock.advance(1);
        player.update();
        const nodeKids = (player.stageNode as FakeNode).children;
        const want = player.stage._children;
        if (nodeKids.length !== want.length) return false;
        // Every Stage child has its own node, in child order: the node of the root is first.
        return nodeKids[0] === player.rootNode && want.every((c, i) => i === 0 || nodeKids[i]!.transform.x === c.x);
      }),
      fcConfig,
    );
  });
});
