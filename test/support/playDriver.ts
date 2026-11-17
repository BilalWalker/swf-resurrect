// PlayDriver: one interface over the two Play_Test layers (as3-coverage Requirement 25.1, design "Play_Tests").
// The Node layer runs the emitted project's Player on a FakeBackend and a ManualClock in this process; the Chromium
// layer calls window.__swfPlay of a page loaded with ?play=1. Both advance time only by step(n).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from 'playwright';
import type { ShapeBounds } from '../../template/runtime/backend';
import type { Inspection } from '../../template/runtime/inspect';
import { FakeBackend } from './fakeBackend';

export interface PlayDriver {
  /** Runs n frame steps of 1000 / frameRate ms each. */
  step(n: number): Promise<void>;
  key(type: 'keyDown' | 'keyUp', code: number): Promise<void>;
  /** A pointer press and release at a stage point. */
  click(x: number, y: number): Promise<void>;
  /** One pointer event: `down` and `up` apart hold the button, `move` sets the pointer position. */
  mouse(type: 'move' | 'down' | 'up', x: number, y: number): Promise<void>;
  inspect(): Promise<Inspection>;
  /** Caught_Errors reported so far. */
  errors(): Promise<Array<{ site: string; message: string }>>;
  /** Ids of the Named_Limits raised since the driver was made (each once). */
  namedLimits(): Promise<string[]>;
}

/** Node layer: the Player of the emitted project at `projectDir`, with the Shim instance the game classes use. */
export async function nodeDriver(projectDir: string): Promise<PlayDriver> {
  const load = (rel: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(join(projectDir, rel)).href);
  const [playerMod, clockMod, loaderMod, classesMod, eventsMod, sinkMod] = await Promise.all([
    load('runtime/player.ts'),
    load('runtime/clock.ts'),
    load('runtime/loader.ts'),
    load('src/classes.ts'),
    load('shim/events.ts'),
    load('shim/errorSink.ts'),
  ]);
  const readText = (rel: string): string => readFileSync(join(projectDir, rel), 'utf8');
  const backend = new FakeBackend();
  const raw = JSON.parse(readText('assets/scene.json')) as {
    symbols: Record<string, { type: string; origin?: { x: number; y: number }; size?: { width: number; height: number } }>;
  };
  for (const [key, sym] of Object.entries(raw.symbols)) {
    if (sym.type !== 'shape' || sym.origin === undefined || sym.size === undefined) continue;
    const b: ShapeBounds = { x: -sym.origin.x, y: -sym.origin.y, width: sym.size.width, height: sym.size.height };
    backend.shapeBounds.set(Number(key), b);
  }
  const loaded = await loaderMod.loadScene(async (url: string) => readText(url), backend);
  if (loaded === null) throw new Error(`scene load failed: ${backend.errors.join('; ')}`);
  const clock = new clockMod.ManualClock();
  const errors: Array<{ site: string; message: string }> = [];
  const player = new playerMod.Player({
    scene: loaded.scene,
    backend,
    clock,
    classRegistry: classesMod.classRegistry,
    shapeBounds: loaded.shapeBounds,
    shapes: loaded.shapes,
    onCaughtError: (c: { site: string; message: string }) => void errors.push({ site: c.site, message: c.message }),
  });
  const KeyboardEvent = eventsMod.KeyboardEvent;
  const limits = new Set<string>();
  return {
    async step(n) {
      for (let i = 0; i < n; i++) {
        clock.advance(player.frameIntervalMs);
        player.update();
      }
    },
    async key(type, code) {
      player.dispatchKey(type === 'keyDown' ? KeyboardEvent.KEY_DOWN : KeyboardEvent.KEY_UP, code);
    },
    async click(x, y) {
      player.dispatchClick(x, y);
    },
    async mouse(type, x, y) {
      if (type === 'move') player.dispatchMouseMove(x, y);
      else if (type === 'down') player.dispatchMouseDown(x, y);
      else player.dispatchMouseUp(x, y);
    },
    async inspect() {
      return player.inspect();
    },
    async errors() {
      return errors.slice();
    },
    async namedLimits() {
      for (const l of sinkMod.takeNamedLimits() as Array<{ id: string }>) limits.add(l.id);
      return [...limits];
    },
  };
}

/** Chromium layer: `page` is loaded with ?play=1 and has window.__swfPlay. Results cross as JSON, so they are copies. */
export function chromiumDriver(page: Page): PlayDriver {
  return {
    step: (n) => page.evaluate((k) => (window as any).__swfPlay.step(k), n),
    key: (type, code) => page.evaluate(([t, c]) => (window as any).__swfPlay.key(t as 'keyDown' | 'keyUp', c as number), [type, code] as const),
    click: (x, y) => page.evaluate(([a, b]) => (window as any).__swfPlay.click(a, b), [x, y] as const),
    mouse: (type, x, y) => page.evaluate(([t, a, b]) => (window as any).__swfPlay.mouse(t, a, b), [type, x, y] as const),
    inspect: async () => {
      // The hook's methods are functions, so the page evaluates them and returns the plain parts. `find(name)` is the
      // pre-order walk of the Stage tops with `children` emptied (template/runtime/inspect.ts), so it is derived here from
      // the one tree the page returns instead of one page-side walk per class name (Checkpoint 3 suite time).
      const data = (await page.evaluate(() => {
        const i = (window as any).__swfPlay.inspect();
        return { tick: i.tick, tree: i.stageChildren(), timers: i.timers() };
      })) as { tick: number; tree: ReturnType<Inspection['stageChildren']>; timers: ReturnType<Inspection['timers']> };
      const found = new Map<string, ReturnType<Inspection['find']>>();
      const walk = (list: ReturnType<Inspection['stageChildren']>): void => {
        for (const s of list) {
          const at = found.get(s.className) ?? [];
          at.push({ ...s, children: [] });
          found.set(s.className, at);
          walk(s.children);
        }
      };
      walk(data.tree);
      return {
        tick: data.tick,
        find: (name: string) => found.get(name) ?? [],
        stageChildren: () => data.tree,
        timers: () => data.timers,
      };
    },
    errors: () => page.evaluate(() => (window as any).__swfPlay.errors()),
    namedLimits: () => page.evaluate(() => (window as any).__swfPlay.namedLimits()),
  };
}
