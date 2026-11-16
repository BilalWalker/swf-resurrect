import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveHitTarget, type TargetNode } from '../../template/runtime/hitTest';
import { fcConfig } from './config';

// Feature: as3-coverage, Property 8: Hit target over Stage children
// **Validates: Requirements 7.6**
// Model: the Stage holds the root clip and Stage children; each top is a container with one shape inside. The Player
// resolves tops from the highest index down and passes the root clip as `rootClip` (template/runtime/player.ts).
const STAGE = { stage: true };
interface N extends TargetNode<typeof STAGE> {
  parent: N | typeof STAGE;
}

const node = (parent: N | typeof STAGE, isContainer: boolean, mouseEnabled: boolean): N => ({
  parent,
  isContainer,
  mouseEnabled,
  mouseChildren: true,
});

describe('Property 8: Hit target over Stage children', () => {
  it('is the topmost enabled Stage child, never the root clip, and the Stage when nothing qualifies', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // the root shape is hit
        fc.array(fc.record({ hit: fc.boolean(), enabled: fc.boolean() }), { maxLength: 6 }), // Stage children, bottom to top
        (rootHit, children) => {
          const root = node(STAGE, true, true);
          const rootShape = node(root, false, true);
          const tops = [root, ...children.map((c) => node(STAGE, true, c.enabled))];
          const shapes = [rootShape, ...children.map((_, i) => node(tops[i + 1]!, false, true))];
          const hitFlags = [rootHit, ...children.map((c) => c.hit)];
          let picked: N | typeof STAGE = STAGE;
          for (let i = tops.length - 1; i >= 0 && picked === STAGE; i--) {
            picked = resolveHitTarget(hitFlags[i] ? [shapes[i]!] : [], STAGE, root);
          }
          let expected: N | typeof STAGE = STAGE;
          for (let i = children.length - 1; i >= 0; i--) {
            if (children[i]!.hit && children[i]!.enabled) {
              expected = tops[i + 1]!;
              break;
            }
          }
          expect(picked).toBe(expected);
          expect(picked).not.toBe(root);
        },
      ),
      fcConfig,
    );
  });
});
