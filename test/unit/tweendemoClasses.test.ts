import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertModel, type ConvertResult } from '../../src/convert/convertModel';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';
import type { ShapeBounds } from '../../template/runtime/backend';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend } from '../support/fakeBackend';
import { loadFixtureClasses, type FixtureClasses } from '../support/fixtureClasses';

// Tick convention (requirements: "Tick: one call of the Runtime's frame step"):
// constructing the Player is NOT a tick (it only renders frame 1 and runs the frame-1
// script). One Tick = `clock.advance(frameIntervalMs)` followed by one `player.update()`,
// which runs exactly one whole frame step (root._step() then exitFrame(root)).
// "After N Ticks" means N such calls since construction.

type Sample = 'clickgoto' | 'tweendemo';

interface Loaded {
  fx: FixtureClasses;
  converted: ConvertResult;
}

async function load(sample: Sample): Promise<Loaded> {
  const fixture = resolve(__dirname, '../fixtures', sample);
  const fx = await loadFixtureClasses(sample);
  const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(fixture, 'structure.xml'), 'utf8'));
  const model = await readUnpacked({
    workDir: fixture,
    shapesDir: resolve(fixture, 'shapes'),
    textsDir: resolve(fixture, 'texts'),
    structureDumpPath: resolve(fixture, 'structure.xml'),
    symbolClassPath: resolve(fixture, 'symbols.csv'),
    scriptsDir: resolve(fixture, 'scripts'),
    header,
    xmlVersion,
  });
  return { fx, converted: convertModel(model) };
}

function boundsFromSvgs(result: ConvertResult): Map<number, ShapeBounds> {
  const out = new Map<number, ShapeBounds>();
  for (const [key, sym] of Object.entries(result.scene.symbols)) {
    if (sym.type !== 'shape') continue;
    out.set(Number(key), { x: -sym.origin.x, y: -sym.origin.y, width: sym.size.width, height: sym.size.height });
  }
  return out;
}

function newRig(loaded: Loaded) {
  const clock = new ManualClock();
  const player = new Player({
    scene: loaded.converted.scene,
    backend: new FakeBackend(),
    clock,
    classRegistry: loaded.fx.classes,
    shapeBounds: boundsFromSvgs(loaded.converted),
  });
  const root = player.root as MovieClip & { l_button: MovieClip; r_button: MovieClip };
  const tick = (): void => {
    clock.advance(player.frameIntervalMs);
    player.update();
  };
  return { player, root, tick };
}

const playing = (mc: MovieClip): boolean => (mc as unknown as { _playing: boolean })._playing;

describe.each<Sample>(['tweendemo', 'clickgoto'])('%s Fixture_Classes', (sample) => {
  let loaded: Loaded;
  beforeAll(async () => {
    loaded = await load(sample);
  });
  afterAll(async () => {
    await loaded.fx.dispose();
  });

  it('l_button and r_button are on frame 1 and stopped after the first Tick', () => {
    const { root, tick } = newRig(loaded);
    tick();
    expect(root.l_button.currentFrame).toBe(1);
    expect(playing(root.l_button)).toBe(false);
    expect(root.r_button.currentFrame).toBe(1);
    expect(playing(root.r_button)).toBe(false);
  });

  it('root MainTimeline is playing after 29 Ticks, stopped after 30, still stopped after 31', () => {
    const { root, tick } = newRig(loaded);
    for (let i = 0; i < 29; i++) tick();
    expect(playing(root), 'after 29 Ticks').toBe(true);
    tick();
    expect(playing(root), 'after 30 Ticks').toBe(false);
    tick();
    expect(playing(root), 'after 31 Ticks').toBe(false);
  });
});
