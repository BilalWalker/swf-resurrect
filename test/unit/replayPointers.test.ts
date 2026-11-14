// Replay applies planned pointer entries in array order through the Player (breadth task 7.4).
// Validates: Requirements 14.3, 14.4, 14.5, 14.6, 14.7

import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { planReplay, type ReplayPlan } from '../../src/verify/core/replayPlan';
import { replay } from '../../src/verify/edge/replay';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const ID_CT = [1, 1, 1, 1, 0, 0, 0, 0];
const placement = (symbolId: number, tx: number, name: string) => ({
  depth: tx === 0 ? 1 : 2,
  symbolId,
  matrix: [1, 0, 0, 1, tx, 0],
  colorTransform: ID_CT,
  name,
});

// Two 40 x 30 buttons: `a` at x 0..40 and `b` at x 100..140. Empty space everywhere else.
const scene = {
  formatVersion: 2,
  stage: { width: 200, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
  rootSymbolId: 0,
  symbols: {
    '0': {
      type: 'sprite',
      frameCount: 1,
      frames: [[placement(2, 0, 'a'), placement(2, 100, 'b')]],
      labels: [],
    },
    '1': { type: 'shape', file: '1.shape.json', origin: { x: 0, y: 0 }, size: { width: 40, height: 30 } },
    '2': {
      type: 'sprite',
      className: 'Btn',
      frameCount: 1,
      frames: [[{ depth: 1, symbolId: 1, matrix: [1, 0, 0, 1, 0, 0], colorTransform: ID_CT, name: '' }]],
      labels: [],
    },
  },
};

const shapeJson =
  '{"formatVersion":1,"paths":[{"contours":[{"outer":[["M",0,0],["L",40,0],["L",40,30],["L",0,30],["Z"]],"holes":[]}],"fill":{"kind":"solid","color":"#000000","alpha":1},"stroke":null}]}';

const classesTs = `
import { MovieClip } from '../shim/MovieClip';
import { MouseEvent } from '../shim/events';
import { trace } from '../shim/trace';

class Btn extends MovieClip {
  constructor() {
    super();
    this.stop();
    for (const type of [MouseEvent.MOUSE_DOWN, MouseEvent.MOUSE_UP, MouseEvent.CLICK]) {
      this.addEventListener(type, (e: any) => trace('ev ' + this.name + ' ' + e.type));
    }
  }
}

export const classRegistry = { Btn };
`;

function planOf(entries: unknown[], ticks: number): ReplayPlan {
  const p = planReplay(JSON.stringify(entries), ticks, 'num_ticks');
  if ('error' in p) throw new Error(p.error);
  return p;
}

const down = (x: number, y: number) => ({ type: 'MouseDown', pos: [x, y], btn: 'Left' });
const up = (x: number, y: number) => ({ type: 'MouseUp', pos: [x, y], btn: 'Left' });
const move = (x: number, y: number) => ({ type: 'MouseMove', pos: [x, y] });
const wait = { type: 'Wait' };

describe('Replay pointer events', () => {
  let tempDir = '';

  beforeAll(async () => {
    const parent = resolve(repoRoot, '.work');
    await mkdir(parent, { recursive: true });
    tempDir = await mkdtemp(resolve(parent, 'replay-pointers-'));
    await cp(resolve(repoRoot, 'template/runtime'), resolve(tempDir, 'runtime'), { recursive: true });
    await cp(resolve(repoRoot, 'template/shim'), resolve(tempDir, 'shim'), { recursive: true });
    await mkdir(resolve(tempDir, 'assets'), { recursive: true });
    await mkdir(resolve(tempDir, 'src'), { recursive: true });
    await writeFile(resolve(tempDir, 'assets/scene.json'), JSON.stringify(scene), 'utf8');
    await writeFile(resolve(tempDir, 'assets/1.shape.json'), shapeJson, 'utf8');
    await writeFile(resolve(tempDir, 'src/classes.ts'), classesTs, 'utf8');
  });

  afterAll(async () => {
    if (tempDir !== '') await rm(tempDir, { recursive: true, force: true });
  });

  const texts = (r: Awaited<ReturnType<typeof replay>>): string[] =>
    r.lines.filter((l) => l.text.startsWith('ev ')).map((l) => l.text);

  it('down, move away, up gives no click', async () => {
    const r = await replay(tempDir, planOf([down(20, 15), move(150, 80), up(150, 80), wait, wait], 3));
    expect(r.error).toBeNull();
    expect(r.ticksRun).toBe(3);
    expect(texts(r)).toEqual(['ev a mouseDown']);
  }, 60_000);

  it('down and up on one target give mouseDown, mouseUp, click in that order', async () => {
    const r = await replay(tempDir, planOf([down(120, 15), up(120, 15), wait, wait], 3));
    expect(r.error).toBeNull();
    expect(texts(r)).toEqual(['ev b mouseDown', 'ev b mouseUp', 'ev b click']);
  }, 60_000);

  it('down on a, up on b gives one release-outside note and no click', async () => {
    const r = await replay(tempDir, planOf([down(20, 15), wait, up(120, 15), wait], 4));
    expect(r.error).toBeNull();
    expect(texts(r)).toEqual(['ev a mouseDown', 'ev b mouseUp']);
    expect(r.releaseOutside).toEqual([{ upIndex: 2, downIndex: 0, pressed: 'root1.a', hit: 'root1.b', tick: 1 }]);
  }, 60_000);

  it('down on a, up over empty space names the stage', async () => {
    const r = await replay(tempDir, planOf([down(20, 15), up(70, 80), wait], 3));
    expect(r.releaseOutside).toEqual([{ upIndex: 1, downIndex: 0, pressed: 'root1.a', hit: 'stage', tick: 0 }]);
  }, 60_000);

  it('a release on the press target gives no note', async () => {
    const r = await replay(tempDir, planOf([down(20, 15), up(20, 15), wait], 3));
    expect(r.releaseOutside).toEqual([]);
  }, 60_000);

  it('delivers entries in array order, down and up in separate ticks', async () => {
    const r = await replay(tempDir, planOf([down(20, 15), wait, up(20, 15), wait], 4));
    expect(texts(r)).toEqual(['ev a mouseDown', 'ev a mouseUp', 'ev a click']);
    const ticks = r.lines.filter((l) => l.text.startsWith('ev ')).map((l) => l.tick);
    expect(ticks).toEqual([0, 1, 1]);
  }, 60_000);
});
