// Property 25: `release-outside` records follow the pressed and hit targets (breadth task 7.6).
// **Validates: Requirements 14.9, 14.20, 14.21, 15.5**
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildInputNotes, type InputNote } from '../../src/verify/core/inputNotes';
import { planReplay, type PlanProblem } from '../../src/verify/core/replayPlan';
import { replay } from '../../src/verify/edge/replay';
import { fcConfig } from './config';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ID_CT = [1, 1, 1, 1, 0, 0, 0, 0];
const placement = (tx: number, name: string) => ({
  depth: tx === 0 ? 1 : 2,
  symbolId: 2,
  matrix: [1, 0, 0, 1, tx, 0],
  colorTransform: ID_CT,
  name,
});
// Clips `a` (x 0..40) and `b` (x 100..140), both 30 high, on a 200 x 100 stage; the rest is empty space.
const scene = {
  formatVersion: 1,
  stage: { width: 200, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
  rootSymbolId: 0,
  symbols: {
    '0': { type: 'sprite', frameCount: 1, frames: [[placement(0, 'a'), placement(100, 'b')]], labels: [] },
    '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } },
    '2': {
      type: 'sprite',
      className: 'Btn',
      frameCount: 1,
      frames: [[{ depth: 1, symbolId: 1, matrix: [1, 0, 0, 1, 0, 0], colorTransform: ID_CT, name: '' }]],
      labels: [],
    },
  },
};
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40px" height="30px"><path d="M0 0 L40 0 40 30 0 30 Z"/></svg>';
const classesTs = `
import { MovieClip } from '../shim/MovieClip';
import { MouseEvent } from '../shim/events';
import { trace } from '../shim/trace';
class Btn extends MovieClip {
  constructor() {
    super();
    this.stop();
    this.addEventListener(MouseEvent.CLICK, () => trace('click ' + this.name));
  }
}
export const classRegistry = { Btn };
`;

type Region = 'a' | 'b' | 'empty';
const POINT: Record<Region, [number, number]> = { a: [20, 15], b: [120, 15], empty: [70, 80] };
const NAME: Record<Region, string> = { a: 'root1.a', b: 'root1.b', empty: 'stage' };
const region = fc.constantFrom<Region>('a', 'b', 'empty');

describe('Property 25: release-outside records follow the pressed and hit targets', () => {
  let tempDir = '';

  beforeAll(async () => {
    const parent = resolve(repoRoot, '.work');
    await mkdir(parent, { recursive: true });
    tempDir = await mkdtemp(resolve(parent, 'release-outside-'));
    await cp(resolve(repoRoot, 'template/runtime'), resolve(tempDir, 'runtime'), { recursive: true });
    await cp(resolve(repoRoot, 'template/shim'), resolve(tempDir, 'shim'), { recursive: true });
    await mkdir(resolve(tempDir, 'assets'), { recursive: true });
    await mkdir(resolve(tempDir, 'src'), { recursive: true });
    await writeFile(resolve(tempDir, 'assets/scene.json'), JSON.stringify(scene), 'utf8');
    await writeFile(resolve(tempDir, 'assets/1.svg'), svg, 'utf8');
    await writeFile(resolve(tempDir, 'src/classes.ts'), classesTs, 'utf8');
  });

  afterAll(async () => {
    if (tempDir !== '') await rm(tempDir, { recursive: true, force: true });
  });

  it('notes are exactly the releases over another target; no click for them', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.tuple(region, region), { minLength: 1, maxLength: 5 }), async (pairs) => {
        // Entry layout per pair: down, wait, up, wait (down and up in separate ticks).
        const entries: unknown[] = [];
        const expected: Array<{ upIndex: number; downIndex: number; pressed: string; hit: string }> = [];
        let clicks = 0;
        for (const [d, u] of pairs) {
          const downIndex = entries.length;
          entries.push({ type: 'MouseDown', pos: POINT[d], btn: 'Left' }, { type: 'Wait' });
          const upIndex = entries.length;
          entries.push({ type: 'MouseUp', pos: POINT[u], btn: 'Left' }, { type: 'Wait' });
          if (d !== u) expected.push({ upIndex, downIndex, pressed: NAME[d], hit: NAME[u] });
          else if (d !== 'empty') clicks += 1;
        }
        const plan = planReplay(JSON.stringify(entries), pairs.length * 2 + 1, 'num_ticks');
        if ('error' in plan) throw new Error(plan.error);
        const r = await replay(tempDir, plan);
        expect(r.error).toBeNull();
        expect(r.releaseOutside.map(({ tick: _tick, ...rest }) => rest)).toEqual(expected);
        expect(r.lines.filter((l) => l.text.startsWith('click ')).length).toBe(clicks);

        const notes = buildInputNotes(plan.problems, r.releaseOutside);
        expect(notes.filter((n) => n.kind === 'release-outside').length).toBe(expected.length);
        expect(notes.length).toBe(plan.problems.length + expected.length);
      }),
      { ...fcConfig, numRuns: 8 },
    );
  }, 300_000);

  it('buildInputNotes loses and adds nothing and sorts by (index, kind)', () => {
    const problem = fc.oneof<fc.Arbitrary<PlanProblem>[]>(
      fc.record({ kind: fc.constant('unpaired-mouse-event' as const), index: fc.nat(30) }),
      fc.record({ kind: fc.constant('unsupported-input' as const), index: fc.nat(30), detail: fc.string() }),
      fc.record({ kind: fc.constant('unused-input' as const), index: fc.nat(30) }),
    );
    const released = fc.record({
      upIndex: fc.nat(30),
      downIndex: fc.nat(30),
      pressed: fc.string(),
      hit: fc.string(),
      tick: fc.nat(10),
    });
    fc.assert(
      fc.property(fc.array(problem, { maxLength: 12 }), fc.array(released, { maxLength: 12 }), (problems, rel) => {
        const notes = buildInputNotes(problems, rel);
        const kept = problems.filter((p) => p.kind !== 'unused-input');
        expect(notes.length).toBe(kept.length + rel.length);
        const key = (n: InputNote) => `${n.kind}|${n.index}|${JSON.stringify(n)}`;
        const want = [
          ...kept.map((p) => (p.kind === 'unsupported-input' ? { kind: p.kind, index: p.index, detail: p.detail } : { kind: p.kind, index: p.index })),
          ...rel.map((x) => ({ kind: 'release-outside' as const, index: x.upIndex, downIndex: x.downIndex, pressed: x.pressed, hit: x.hit })),
        ] as InputNote[];
        expect(notes.map(key).sort()).toEqual(want.map(key).sort());
        for (let i = 1; i < notes.length; i++) {
          const a = notes[i - 1]!;
          const b = notes[i]!;
          expect(a.index < b.index || (a.index === b.index && a.kind <= b.kind)).toBe(true);
        }
      }),
      fcConfig,
    );
  });
});
