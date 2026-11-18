import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildButton } from '../../src/convert/buttons';
import type { ButtonRecordModel } from '../../src/convert/model';
import { parseScene, serialiseScene } from '../../src/convert/sceneJson';
import type { ButtonState } from '../../template/runtime/buttonModel';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import { validateScene } from '../../template/runtime/scene';
import type { ButtonSymbol, DisplayListEntry } from '../../template/runtime/scene';
import { MouseEvent } from '../../template/shim/events';
import { SimpleButton } from '../../template/shim/SimpleButton';
import { FakeBackend } from '../support/fakeBackend';
import type { SceneJson } from '../../template/runtime/scene';
import { fcConfig } from './config';
import { genButtonRecords } from './gen/genButtonRecords';

const STATES = ['up', 'over', 'down', 'hit'] as const;

const sprite = { type: 'sprite', frameCount: 1, frames: [[]], labels: [] };
// Characters 1..20 are what the generated records refer to.
const characters = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), sprite]));
const sceneOf = (symbols: Record<string, unknown>): SceneJson =>
  ({
    formatVersion: 4,
    stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 12 },
    rootSymbolId: 0,
    symbols: { '0': sprite, ...characters, ...symbols },
  }) as unknown as SceneJson;

describe('button conversion and scene round trip', () => {
  // Feature: robustness, Property 23: Button symbol conversion and scene round trip
  // **Validates: Requirements 20.1, 20.2, 21.1, 21.2**
  it('Property 23: each record is in exactly the states whose flags are set, ordered by depth, and the scene round trips', () => {
    fc.assert(
      fc.property(genButtonRecords, fc.boolean(), (records: ButtonRecordModel[], trackAsMenu) => {
        const { symbol } = buildButton({ id: 100, trackAsMenu, hasActions: false, records });
        for (const s of STATES) {
          const list = symbol.states[s];
          const depths = list.map((e) => e.depth);
          expect(depths).toEqual([...new Set(depths)].sort((a, b) => a - b));
          // The later record at a depth wins; every depth with a flagged record appears once.
          const expected = new Map<number, number>();
          for (const r of records) if (r[s]) expected.set(r.depth, r.characterId);
          expect(list.map((e) => [e.depth, e.symbolId])).toEqual([...expected].sort((a, b) => a[0] - b[0]));
        }

        const withButton = sceneOf({ '100': symbol });
        const text = serialiseScene(withButton);
        expect(JSON.parse(text).formatVersion).toBe(4);
        const parsed = parseScene(text);
        expect(parsed.symbols['100']).toEqual(symbol);
        expect(serialiseScene(parsed)).toBe(text);

        const noButton = serialiseScene(sceneOf({}));
        expect(JSON.parse(noButton).formatVersion).toBe(3);
        expect(parseScene(noButton).formatVersion).toBe(3);
      }),
      fcConfig,
    );
  });

  it('the reader accepts versions 2, 3 and 4', () => {
    for (const v of [2, 3, 4]) expect(() => validateScene({ ...sceneOf({}), formatVersion: v })).not.toThrow();
  });
});

// ---- Property 24 ----
const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
const entryOf = (symbolId: number, tx: number, ty: number): DisplayListEntry => ({ depth: 1, symbolId, matrix: [1, 0, 0, 1, tx, ty], colorTransform: ID_CT, name: '' });
const boxShape = (file: string) => ({ type: 'shape' as const, file, origin: { x: 0, y: 0 }, size: { width: 40, height: 30 } });
// Each state holds one 40 x 30 box in button space: up at (0,0), over and down at (100,0), hit at (0,100).
const RECTS: Record<'up' | 'over' | 'down' | 'hit', [number, number]> = { up: [0, 0], over: [100, 0], down: [100, 0], hit: [0, 100] };
const BUTTON_SYMBOL: ButtonSymbol = {
  type: 'button',
  trackAsMenu: false,
  states: { up: [entryOf(1, 0, 0)], over: [entryOf(1, 100, 0)], down: [entryOf(1, 100, 0)], hit: [entryOf(1, 0, 100)] },
};
function buildButtonPlayer(m: [number, number, number, number, number, number], symbol: ButtonSymbol = BUTTON_SYMBOL): { player: Player; btn: SimpleButton } {
  const scene = {
    formatVersion: 4,
    stage: { width: 300, height: 300, backgroundColor: '#ffffff', frameRate: 10 },
    rootSymbolId: 0,
    symbols: {
      '0': { type: 'sprite', frameCount: 1, frames: [[{ depth: 1, symbolId: 2, matrix: m, colorTransform: ID_CT, name: '' }]], labels: [] },
      '1': boxShape('1.shape.json'),
      '2': symbol,
    },
  } as unknown as SceneJson;
  const shapeBounds = new Map([[1, { x: 0, y: 0, width: 40, height: 30 }]]);
  const player = new Player({ scene, backend: new FakeBackend(), clock: new ManualClock(), classRegistry: {}, shapeBounds });
  return { player, btn: player.root.getChildAt(0) as SimpleButton };
}
const insideRect = (x: number, y: number, [rx, ry]: [number, number]): boolean => x >= rx && x <= rx + 40 && y >= ry && y <= ry + 30;
const nearEdge = (x: number, y: number): boolean =>
  Object.values(RECTS).some(([rx, ry]) => x >= rx - 1 && x <= rx + 41 && y >= ry - 1 && y <= ry + 31 && !(x > rx + 1 && x < rx + 39 && y > ry + 1 && y < ry + 29));

describe('button hit region (Player)', () => {
  // Feature: robustness, Property 24: Button hit region
  // **Validates: Requirements 20.4, 20.5, 20.7, 20.8, 20.12, 20.19**
  it('Property 24: a click reaches the button iff the point is in the current state or the hit shapes, after the placement transform', () => {
    const placement = fc
      .tuple(fc.double({ min: 0.5, max: 3, noNaN: true }), fc.double({ min: 0, max: 6.28, noNaN: true }), fc.integer({ min: -50, max: 150 }), fc.integer({ min: -50, max: 150 }))
      .map(([s, a, tx, ty]): [number, number, number, number, number, number] => [s * Math.cos(a), s * Math.sin(a), -s * Math.sin(a), s * Math.cos(a), tx, ty]);
    const point = fc.tuple(fc.integer({ min: -20, max: 160 }), fc.integer({ min: -20, max: 140 })).filter(([x, y]) => !nearEdge(x, y));
    fc.assert(
      fc.property(placement, point, fc.constantFrom('up', 'over', 'down'), (m, [lx, ly], state) => {
        const { player, btn } = buildButtonPlayer(m);
        btn._setState(state);
        let clicks = 0;
        // A click would move the state (hover, then press) and so the region; the first hover entry is tested under the state set here.
        btn.addEventListener(MouseEvent.MOUSE_OVER, () => clicks++);
        player.dispatchMouseMove(m[0] * lx + m[2] * ly + m[4], m[1] * lx + m[3] * ly + m[5]);
        const expected = insideRect(lx, ly, RECTS[state]) || insideRect(lx, ly, RECTS.hit);
        expect(clicks).toBe(expected ? 1 : 0);
      }),
      fcConfig,
    );
  });
});

// ---- Property 25 ----
type PointerAction = 'moveOn' | 'moveOff' | 'press' | 'release';
const ON: [number, number] = [10, 10];
const OFF: [number, number] = [200, 200];
// All states draw the same box, so the pointer stays on the button whatever the state.
const STILL_SYMBOL: ButtonSymbol = {
  type: 'button',
  trackAsMenu: false,
  states: { up: [entryOf(1, 0, 0)], over: [entryOf(1, 0, 0)], down: [entryOf(1, 0, 0)], hit: [] },
};
describe('button state model', () => {
  // Feature: robustness, Property 25: Button state follows the pointer model
  // **Validates: Requirements 20.5, 20.6, 20.10, 20.16, 20.17, 20.19**
  // Real pointer calls go through the Player (task 22.2); `model` below is the independent expectation.
  it('Property 25: the drawn state equals the pointer model for any sequence, and a disabled button is always up and inert', () => {
    const actions = fc.array(fc.constantFrom<PointerAction>('moveOn', 'moveOff', 'press', 'release'), { maxLength: 40 });
    fc.assert(
      fc.property(actions, fc.boolean(), (seq, enabled) => {
        const { player, btn } = buildButtonPlayer([1, 0, 0, 1, 0, 0], STILL_SYMBOL);
        btn.enabled = enabled;
        let mouseDowns = 0;
        btn.addEventListener(MouseEvent.MOUSE_DOWN, () => mouseDowns++);
        let on = false;
        let down = false;
        let pressedOnButton = false;
        let expectedDowns = 0;
        for (const a of seq) {
          if (a === 'moveOn' && !on) {
            on = true;
            player.dispatchMouseMove(...ON);
          } else if (a === 'moveOff' && on) {
            on = false;
            player.dispatchMouseMove(...OFF);
          } else if (a === 'press') {
            const [x, y] = on ? ON : OFF;
            if (!down) {
              down = true;
              pressedOnButton = on;
              if (on) expectedDowns++;
            }
            player.dispatchMouseDown(x, y);
          } else if (a === 'release') {
            const [x, y] = on ? ON : OFF;
            down = false;
            pressedOnButton = false;
            player.dispatchMouseUp(x, y);
          }
          const model: ButtonState = pressedOnButton && on ? 'down' : on || pressedOnButton ? 'over' : 'up';
          expect(btn._drawnState).toBe(enabled ? model : 'up');
        }
        expect(mouseDowns).toBe(enabled ? expectedDowns : 0);
      }),
      fcConfig,
    );
  });
});