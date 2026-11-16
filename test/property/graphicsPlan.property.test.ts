import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planGraphics } from '../../template/runtime/graphicsPlan';
import { NodeRegistry } from '../../template/runtime/stageTree';
import { Graphics, type GfxPrim } from '../../template/shim/Graphics';
import { Sprite } from '../../template/shim/Sprite';
import { FakeBackend, type FakeNode } from '../support/fakeBackend';
import { fcConfig } from './config';
// Feature: as3-coverage, Property 15: Graphics plan replays what was issued
// **Validates: Requirements 14.3, 14.4, 14.11**
const coord = fc.integer({ min: -50, max: 50 });
type Call =
  | { c: 'lineStyle'; w: number; col: number }
  | { c: 'beginFill'; col: number }
  | { c: 'endFill' }
  | { c: 'drawCircle'; x: number; y: number; r: number }
  | { c: 'moveTo'; x: number; y: number }
  | { c: 'lineTo'; x: number; y: number }
  | { c: 'drawPath'; cmds: number[]; data: number[] }
  | { c: 'clear' };
const call: fc.Arbitrary<Call> = fc.oneof(
  fc.record({ c: fc.constant('lineStyle' as const), w: fc.integer({ min: 0, max: 10 }), col: fc.integer({ min: 0, max: 0xffffff }) }),
  fc.record({ c: fc.constant('beginFill' as const), col: fc.integer({ min: 0, max: 0xffffff }) }),
  fc.constant({ c: 'endFill' as const }),
  fc.record({ c: fc.constant('drawCircle' as const), x: coord, y: coord, r: fc.integer({ min: 0, max: 20 }) }),
  fc.record({ c: fc.constant('moveTo' as const), x: coord, y: coord }),
  fc.record({ c: fc.constant('lineTo' as const), x: coord, y: coord }),
  fc.record({
    c: fc.constant('drawPath' as const),
    cmds: fc.array(fc.constantFrom(1, 2, 3, 0), { maxLength: 6 }),
    data: fc.array(coord, { minLength: 12, maxLength: 12 }),
  }),
  fc.constant({ c: 'clear' as const }),
);
/** The primitives the calls must record, written out independently of the Graphics class. */
function expected(calls: Call[]): GfxPrim[] {
  let out: GfxPrim[] = [];
  for (const k of calls) {
    if (k.c === 'lineStyle') out.push({ k: 'lineStyle', width: k.w, color: k.col });
    else if (k.c === 'beginFill') out.push({ k: 'beginFill', color: k.col });
    else if (k.c === 'endFill') out.push({ k: 'endFill' });
    else if (k.c === 'drawCircle') out.push({ k: 'circle', x: k.x, y: k.y, r: k.r });
    else if (k.c === 'moveTo') out.push({ k: 'moveTo', x: k.x, y: k.y });
    else if (k.c === 'lineTo') out.push({ k: 'lineTo', x: k.x, y: k.y });
    else if (k.c === 'clear') out = [];
    else
      k.cmds.forEach((cmd, i) => {
        const x = k.data[2 * i] as number;
        const y = k.data[2 * i + 1] as number;
        if (cmd === 1) out.push({ k: 'moveTo', x, y });
        else if (cmd === 2) out.push({ k: 'lineTo', x, y });
      });
  }
  return out;
}
function issue(g: Graphics, k: Call): void {
  if (k.c === 'lineStyle') g.lineStyle(k.w, k.col);
  else if (k.c === 'beginFill') g.beginFill(k.col);
  else if (k.c === 'endFill') g.endFill();
  else if (k.c === 'drawCircle') g.drawCircle(k.x, k.y, k.r);
  else if (k.c === 'moveTo') g.moveTo(k.x, k.y);
  else if (k.c === 'lineTo') g.lineTo(k.x, k.y);
  else if (k.c === 'clear') g.clear();
  else g.drawPath(k.cmds, k.data);
}
describe('Property 15: Graphics plan replays what was issued', () => {
  it('the FakeBackend draw operations equal the plan of the issued calls; drawPath consumes two values per command', () => {
    fc.assert(
      fc.property(fc.array(call, { maxLength: 25 }), (calls) => {
        const s = new Sprite();
        const backend = new FakeBackend();
        const node = backend.createContainer() as FakeNode;
        const reg = new NodeRegistry();
        reg.register(s, node);
        for (const k of calls) issue(s.graphics, k);
        reg.syncTree(backend, s);
        const prims = expected(calls);
        expect(s.graphics._prims).toEqual(prims);
        const plan = planGraphics(prims);
        expect(node.graphics).toEqual(prims.length === 0 ? null : plan);
      }),
      fcConfig,
    );
  });
});
