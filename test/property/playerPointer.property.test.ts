import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson } from '../../template/runtime/scene';
import type { DisplayObject } from '../../template/shim/DisplayObject';
import { FakeBackend } from '../support/fakeBackend';
import { fcConfig } from './config';

// Feature: breadth, Property 17: The Player's pointer events follow the reference model
// **Validates: Requirements 14.4, 14.5, 14.6, 14.7, 14.8, 19.4, 15.5**

const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
const at = (depth: number, tx: number, ty: number): DisplayListEntry => ({
  depth,
  symbolId: 1,
  matrix: [1, 0, 0, 1, tx, ty],
  colorTransform: ID_CT,
  name: '',
});

// Three 40 x 30 shapes: A at (0,0), B (above A) at (20,10), C at (100,0).
const SCENE: SceneJson = {
  formatVersion: 1,
  stage: { width: 300, height: 300, backgroundColor: '#ffffff', frameRate: 10 },
  rootSymbolId: 0,
  symbols: {
    '0': { type: 'sprite', frameCount: 1, frames: [[at(1, 0, 0), at(2, 20, 10), at(3, 100, 0)]], labels: [] },
    '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } },
  },
};

// Points with the shape they hit: A, B (over A), C, nothing, B only.
const POINTS: Array<{ x: number; y: number; hit: string }> = [
  { x: 5, y: 5, hit: 'A' },
  { x: 30, y: 20, hit: 'B' },
  { x: 120, y: 10, hit: 'C' },
  { x: 200, y: 200, hit: 'stage' },
  { x: 50, y: 35, hit: 'B' },
];

type Op = { kind: 'move' | 'down' | 'up'; p: number };

function rig() {
  const player = new Player({
    scene: SCENE,
    backend: new FakeBackend(),
    clock: new ManualClock(),
    classRegistry: {},
    shapeBounds: new Map([[1, { x: 0, y: 0, width: 40, height: 30 }]]),
  });
  const [a, b, c] = player.root._children;
  const label = new Map<unknown, string>([
    [player.stage, 'stage'],
    [player.root, 'root'],
    [a, 'A'],
    [b, 'B'],
    [c, 'C'],
  ]);
  const log: string[] = [];
  for (const o of label.keys()) {
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp', 'click']) {
      (o as DisplayObject).addEventListener(type, (e) => {
        log.push(`${type} target=${label.get(e.target)} at=${label.get(e.currentTarget)} phase=${e.eventPhase}`);
      });
    }
  }
  return { player, log };
}

/** Straightforward model of Requirements 14.4 to 14.8. Bubbling: shape, root, stage; the stage target stays alone. */
function model(ops: Op[]) {
  const log: string[] = [];
  const outcomes: Array<{ pressed: string; hit: string } | null> = [];
  let px = 0;
  let py = 0;
  let down = false;
  let pressed = '';
  const emit = (type: string, target: string): void => {
    const path = target === 'stage' ? ['stage'] : [target, 'root', 'stage'];
    path.forEach((n, i) => log.push(`${type} target=${target} at=${n} phase=${i === 0 ? 2 : 3}`));
  };
  for (const op of ops) {
    const pt = POINTS[op.p]!;
    if (pt.x !== px || pt.y !== py) {
      px = pt.x;
      py = pt.y;
      emit('mouseMove', pt.hit);
    }
    if (op.kind === 'down' && !down) {
      down = true;
      pressed = pt.hit;
      emit('mouseDown', pt.hit);
    } else if (op.kind === 'up') {
      if (!down) outcomes.push(null);
      else {
        down = false;
        emit('mouseUp', pt.hit);
        if (pressed === pt.hit) {
          emit('click', pt.hit);
          outcomes.push(null);
        } else outcomes.push({ pressed, hit: pt.hit });
      }
    }
  }
  return { log, outcomes };
}

describe('Property 17: The Player pointer events follow the reference model', () => {
  it('event log and release-outside outcomes equal the model', () => {
    const opArb = fc.record({
      kind: fc.constantFrom<Op['kind']>('move', 'down', 'up'),
      p: fc.integer({ min: 0, max: POINTS.length - 1 }),
    });
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 25 }), (ops) => {
        const { player, log } = rig();
        const label = (o: unknown): string =>
          o === player.stage ? 'stage' : ['A', 'B', 'C'][player.root._children.indexOf(o as DisplayObject)]!;
        const outcomes: Array<{ pressed: string; hit: string } | null> = [];
        for (const op of ops) {
          const pt = POINTS[op.p]!;
          if (op.kind === 'move') player.dispatchMouseMove(pt.x, pt.y);
          else if (op.kind === 'down') player.dispatchMouseDown(pt.x, pt.y);
          else {
            const r = player.dispatchMouseUp(pt.x, pt.y).releaseOutside;
            outcomes.push(r === null ? null : { pressed: label(r.pressed), hit: label(r.hit) });
          }
          expect(player.pointer).toEqual({ x: pt.x, y: pt.y });
        }
        const expected = model(ops);
        expect(log).toEqual(expected.log);
        expect(outcomes).toEqual(expected.outcomes);
      }),
      fcConfig,
    );
  });

  it('the pointer starts at (0, 0)', () => {
    expect(rig().player.pointer).toEqual({ x: 0, y: 0 });
  });
});
