import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { globalToLocal, setPointerPosition } from '../../template/shim/internal';
import { Sprite } from '../../template/shim/Sprite';
import { fcConfig } from './config';

// Feature: breadth, Property 18: Pointer coordinates round-trip through the parent chain
// **Validates: Requirements 14.10, 15.5**

const nonZero = fc.double({ min: 0.25, max: 4, noNaN: true }).chain((m) => fc.boolean().map((neg) => (neg ? -m : m)));
const level = fc.record({
  x: fc.double({ min: -500, max: 500, noNaN: true }),
  y: fc.double({ min: -500, max: 500, noNaN: true }),
  scaleX: nonZero,
  scaleY: nonZero,
  rotation: fc.double({ min: -720, max: 720, noNaN: true }),
});

describe('Property 18: Pointer coordinates round-trip through the parent chain', () => {
  it('globalToLocal inverts the forward transform and mouseX/mouseY equal it', () => {
    fc.assert(
      fc.property(
        fc.array(level, { minLength: 1, maxLength: 5 }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (levels, gx, gy) => {
          const nodes = levels.map((l) => Object.assign(new Sprite(), l));
          for (let i = 1; i < nodes.length; i++) nodes[i - 1]!.addChild(nodes[i]!);
          const leaf = nodes[nodes.length - 1]!;
          const local = globalToLocal(leaf, gx, gy);
          // Forward: p' = T + R * S * p, leaf first.
          let px = local.x;
          let py = local.y;
          for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i]!;
            const rad = (n.rotation * Math.PI) / 180;
            const sx = n.scaleX * px;
            const sy = n.scaleY * py;
            px = n.x + Math.cos(rad) * sx - Math.sin(rad) * sy;
            py = n.y + Math.sin(rad) * sx + Math.cos(rad) * sy;
          }
          const tol = (v: number) => 1e-6 * Math.max(1, Math.abs(v));
          expect(Math.abs(px - gx)).toBeLessThanOrEqual(tol(gx));
          expect(Math.abs(py - gy)).toBeLessThanOrEqual(tol(gy));
          setPointerPosition(gx, gy);
          expect(leaf.mouseX).toBe(local.x);
          expect(leaf.mouseY).toBe(local.y);
        },
      ),
      fcConfig,
    );
  });
});
