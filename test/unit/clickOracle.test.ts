import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { convertModel, type ConvertResult } from '../../src/convert/convertModel';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { LeftButton } from '../../handwritten/clickgoto/LeftButton';
import { RightButton } from '../../handwritten/clickgoto/RightButton';
import type { ShapeBounds } from '../../template/runtime/backend';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend, type FakeNode } from '../support/fakeBackend';
import { parseExpectedState, type ButtonState, type ExpectedRow } from '../support/provenance';

const fixture = resolve(__dirname, '../fixtures/clickgoto');
const provenance = resolve(__dirname, '../../samples/clickgoto/PROVENANCE.md');

// Click_Sample button centres in stage pixels (Requirement 8.4 / PROVENANCE.md).
const L_POS = { x: 143.5, y: 270 };
const R_POS = { x: 415, y: 272.5 };
const OUTSIDE = { x: 5, y: 5 };

let converted: ConvertResult;
let rows: ExpectedRow[];

beforeAll(async () => {
  const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(fixture, 'structure.xml'), 'utf8'));
  const model = await readUnpacked({
    workDir: fixture,
    shapesDir: resolve(fixture, 'shapes'),
    structureDumpPath: resolve(fixture, 'structure.xml'),
    symbolClassPath: resolve(fixture, 'symbols.csv'),
    scriptsDir: resolve(fixture, 'scripts'),
    header,
    xmlVersion,
  });
  converted = convertModel(model);
  rows = parseExpectedState(readFileSync(provenance, 'utf8'));
});

/** Bounds from each SVG's width/height, positioned by the shape origin like the real backend. */
function boundsFromSvgs(result: ConvertResult): Map<number, ShapeBounds> {
  const out = new Map<number, ShapeBounds>();
  for (const f of result.svgFiles) {
    const id = parseInt(f.fileName, 10);
    const sym = result.scene.symbols[String(id)];
    if (sym?.type !== 'shape') continue;
    const w = /\bwidth="([\d.]+)px"/.exec(f.content);
    const h = /\bheight="([\d.]+)px"/.exec(f.content);
    if (!w || !h) throw new Error(`no size in ${f.fileName}`);
    out.set(id, { x: -sym.origin.x, y: -sym.origin.y, width: Number(w[1]), height: Number(h[1]) });
  }
  return out;
}

interface Rig {
  player: Player;
  clock: ManualClock;
  backend: FakeBackend;
  l: MovieClip;
  r: MovieClip;
}

function newRig(): Rig {
  const backend = new FakeBackend();
  const clock = new ManualClock();
  const player = new Player({
    scene: converted.scene,
    backend,
    clock,
    classRegistry: { LeftButton, RightButton },
    shapeBounds: boundsFromSvgs(converted),
  });
  const root = player.root as MovieClip & { l_button: MovieClip; r_button: MovieClip };
  return { player, clock, backend, l: root.l_button, r: root.r_button };
}

function stateOf(mc: MovieClip): ButtonState {
  return { playing: (mc as unknown as { _playing: boolean })._playing, frame: mc.currentFrame };
}

function expectRow(rig: Rig, row: ExpectedRow): void {
  expect(stateOf(rig.l), `${row.action}: l_button`).toEqual(row.l_button);
  expect(stateOf(rig.r), `${row.action}: r_button`).toEqual(row.r_button);
}

function rowFor(pattern: RegExp): ExpectedRow {
  const row = rows.find((r) => pattern.test(r.action));
  if (row === undefined) throw new Error(`no Expected_State row matches ${pattern}`);
  return row;
}

describe('Click_Sample oracle (Expected_State from PROVENANCE.md)', () => {
  it('starts in the Start row state with both buttons bound', () => {
    const rig = newRig();
    expect(rig.l).toBeInstanceOf(LeftButton);
    expect(rig.r).toBeInstanceOf(RightButton);
    expectRow(rig, rowFor(/^start/i));
  });

  it('click inside l_button gives the "Click l_button" row', () => {
    const rig = newRig();
    rig.player.dispatchClick(L_POS.x, L_POS.y);
    expectRow(rig, rowFor(/click\s+l_button/i));
  });

  it('after a reset, click inside r_button gives the "Click r_button" row, then loops one frame per tick', () => {
    const rig = newRig(); // reset: a fresh player starts in the Start row state
    expectRow(rig, rowFor(/^start/i));
    rig.player.dispatchClick(R_POS.x, R_POS.y);
    const row = rowFor(/click\s+r_button/i);
    expectRow(rig, row);

    rig.clock.advance(rig.player.frameIntervalMs);
    rig.player.update();
    const next = (s: ButtonState): ButtonState => ({ playing: s.playing, frame: s.frame === 1 ? 2 : 1 });
    expect(stateOf(rig.l)).toEqual(next(row.l_button));
    expect(stateOf(rig.r)).toEqual(next(row.r_button));

    rig.clock.advance(rig.player.frameIntervalMs);
    rig.player.update();
    expect(stateOf(rig.l)).toEqual(row.l_button);
    expect(stateOf(rig.r)).toEqual(row.r_button);
  });

  it('a click outside every object changes nothing', () => {
    const rig = newRig();
    rig.player.dispatchClick(OUTSIDE.x, OUTSIDE.y);
    expectRow(rig, rowFor(/^start/i));

    rig.player.dispatchClick(L_POS.x, L_POS.y);
    const before = { l: stateOf(rig.l), r: stateOf(rig.r) };
    rig.player.dispatchClick(OUTSIDE.x, OUTSIDE.y);
    expect({ l: stateOf(rig.l), r: stateOf(rig.r) }).toEqual(before);
  });

  it('places the buttons at (143.5, 270) and (415, 272.5)', () => {
    const rig = newRig();
    const rootNode = rig.player.rootNode as FakeNode;
    const positions = rootNode.children.map((c) => [c.transform.x, c.transform.y]);
    expect(positions).toEqual([
      [L_POS.x, L_POS.y],
      [R_POS.x, R_POS.y],
    ]);
  });
});
