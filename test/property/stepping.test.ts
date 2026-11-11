import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { DisplayListEntry, SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import { Event } from '../../template/shim/events';
import { MovieClip } from '../../template/shim/MovieClip';
import { FakeBackend } from '../support/fakeBackend';
import { fcConfig } from './config';

const ID_CT: DisplayListEntry['colorTransform'] = [1, 1, 1, 1, 0, 0, 0, 0];
const MAX_CATCH_UP = 5;

function entry(depth: number, symbolId: number, name = ''): DisplayListEntry {
  return { depth, symbolId, matrix: [1, 0, 0, 1, 0, 0], colorTransform: ID_CT, name };
}

/** A clip in the generated scene. */
interface ClipSpec {
  frames: number;
  stopped: boolean;
  children: ClipSpec[];
}

class StoppedClip extends MovieClip {
  constructor() {
    super();
    this.stop();
  }
}

/** Builds the scene for a spec tree. Every clip gets its own symbol; children sit on every parent frame. */
function buildScene(root: ClipSpec, frameRate: number): { scene: SceneJson; specs: Map<number, ClipSpec> } {
  const symbols: SceneJson['symbols'] = { '1': { type: 'shape', file: '1.svg', origin: { x: 0, y: 0 } } };
  const specs = new Map<number, ClipSpec>();
  let nextId = 10;
  const add = (spec: ClipSpec, id: number): void => {
    const childIds = spec.children.map(() => nextId++);
    const frames: DisplayListEntry[][] = [];
    for (let f = 0; f < spec.frames; f++) {
      frames.push([entry(1, 1), ...childIds.map((cid, i) => entry(i + 2, cid, `c${i}`))]);
    }
    const sym: SpriteSymbol = { type: 'sprite', frameCount: spec.frames, frames, labels: [] };
    if (spec.stopped && id !== 0) sym.className = 'Stopped';
    symbols[String(id)] = sym;
    specs.set(id, spec);
    spec.children.forEach((c, i) => add(c, childIds[i]!));
  };
  add(root, 0);
  return {
    scene: {
      formatVersion: 1,
      stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate },
      rootSymbolId: 0,
      symbols,
    },
    specs,
  };
}

function makePlayer(scene: SceneJson, rootStopped: boolean) {
  const backend = new FakeBackend();
  const clock = new ManualClock();
  const shapeBounds = new Map([[1, { x: 0, y: 0, width: 10, height: 10 }]]);
  let enterFrames = 0;
  class RootClip extends MovieClip {
    constructor() {
      super();
      if (rootStopped) this.stop();
      this.addEventListener(Event.ENTER_FRAME, () => {
        enterFrames++;
      });
    }
  }
  scene.symbols['0'] = { ...(scene.symbols['0'] as SpriteSymbol), className: 'Root' };
  const player = new Player({
    scene,
    backend,
    clock,
    classRegistry: { Root: RootClip, Stopped: StoppedClip },
    shapeBounds,
    maxCatchUpFrames: MAX_CATCH_UP,
  });
  return { player, clock, enterFrames: () => enterFrames };
}

describe('Player stepping (example)', () => {
  it.each([2, 3, 7, 10])('%i frames at 10 fps: one frame per interval, back to 1 on the next tick', (n) => {
    const spec: ClipSpec = { frames: n, stopped: false, children: [] };
    const { scene } = buildScene(spec, 10);
    const { player, clock } = makePlayer(scene, false);
    expect(player.frameIntervalMs).toBe(100);
    expect(player.root.currentFrame).toBe(1);
    for (let k = 1; k < n; k++) {
      clock.advance(99);
      player.update();
      expect(player.root.currentFrame).toBe(k);
      clock.advance(1);
      player.update();
      expect(player.root.currentFrame).toBe(k + 1);
    }
    clock.advance(100);
    player.update();
    expect(player.root.currentFrame).toBe(1);
  });
});

// Frame rates whose interval is a whole number of milliseconds, so the model's arithmetic is exact.
const frameRateArb = fc.constantFrom(1, 2, 4, 5, 8, 10, 20, 25, 40, 50);

const leafArb: fc.Arbitrary<ClipSpec> = fc.record({
  frames: fc.integer({ min: 1, max: 10 }),
  stopped: fc.boolean(),
  children: fc.constant([] as ClipSpec[]),
});
const midArb: fc.Arbitrary<ClipSpec> = fc.record({
  frames: fc.integer({ min: 1, max: 10 }),
  stopped: fc.boolean(),
  children: fc.array(leafArb, { maxLength: 2 }),
});
const rootArb: fc.Arbitrary<ClipSpec> = fc.record({
  frames: fc.integer({ min: 1, max: 10 }),
  stopped: fc.boolean(),
  children: fc.array(midArb, { maxLength: 2 }),
});

// Mostly sub-interval and multi-interval steps, with the occasional long stall to hit the cap.
const incrementArb = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 1, max: 150 }) },
  { weight: 1, arbitrary: fc.integer({ min: 151, max: 2000 }) },
);

describe('Property 13: Stepping advances exactly one frame per interval and loops', () => {
  /**
   * **Validates: Requirements 6.2, 6.3, 6.10, 6.11, 10.4**
   */
  it('runs floor(elapsed / interval) steps and every clip follows the loop model', () => {
    fc.assert(
      fc.property(
        frameRateArb,
        rootArb,
        fc.array(incrementArb, { minLength: 1, maxLength: 40 }),
        (frameRate, rootSpec, increments) => {
          const interval = 1000 / frameRate;
          const { scene, specs } = buildScene(rootSpec, frameRate);
          const { player, clock, enterFrames } = makePlayer(scene, rootSpec.stopped);
          expect(player.frameIntervalMs).toBe(interval);

          // New instances start on frame 1 and playing (unless their class stops them).
          const symbolOf = new Map<MovieClip, ClipSpec>();
          const collect = (clip: MovieClip, spec: ClipSpec): void => {
            symbolOf.set(clip, spec);
            expect(clip.currentFrame).toBe(1);
            expect(clip.totalFrames).toBe(spec.frames);
            spec.children.forEach((c, i) => {
              const child = (clip as unknown as Record<string, MovieClip>)[`c${i}`];
              expect(child).toBeInstanceOf(MovieClip);
              collect(child!, c);
            });
          };
          collect(player.root, rootSpec);
          void specs;

          // Model: exact integer accumulator with the catch-up cap.
          let acc = 0;
          let steps = 0;
          let total = 0;
          let capped = false;
          for (const inc of increments) {
            clock.advance(inc);
            player.update();
            total += inc;
            acc += inc;
            const due = Math.floor(acc / interval);
            const run = Math.min(due, MAX_CATCH_UP);
            if (due > MAX_CATCH_UP) capped = true;
            steps += run;
            acc -= run * interval;
            if (acc >= interval) acc %= interval;

            expect(enterFrames()).toBe(steps);
            if (!capped) expect(steps).toBe(Math.floor(total / interval));
            for (const [clip, spec] of symbolOf) {
              const moves = !spec.stopped && spec.frames > 1;
              const expected = moves ? (steps % spec.frames) + 1 : 1;
              expect(clip.currentFrame).toBe(expected);
            }
          }
        },
      ),
      fcConfig,
    );
  });
});
