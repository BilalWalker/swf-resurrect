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
  inspect(): Promise<Inspection>;
  /** Caught_Errors reported so far. */
  errors(): Promise<Array<{ site: string; message: string }>>;
}

/** Node layer: the Player of the emitted project at `projectDir`, with the Shim instance the game classes use. */
export async function nodeDriver(projectDir: string): Promise<PlayDriver> {
  const load = (rel: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(join(projectDir, rel)).href);
  const [playerMod, clockMod, loaderMod, classesMod, eventsMod] = await Promise.all([
    load('runtime/player.ts'),
    load('runtime/clock.ts'),
    load('runtime/loader.ts'),
    load('src/classes.ts'),
    load('shim/events.ts'),
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
    async inspect() {
      return player.inspect();
    },
    async errors() {
      return errors.slice();
    },
  };
}

/** Chromium layer: `page` is loaded with ?play=1 and has window.__swfPlay. Results cross as JSON, so they are copies. */
export function chromiumDriver(page: Page): PlayDriver {
  return {
    step: (n) => page.evaluate((k) => (window as any).__swfPlay.step(k), n),
    key: (type, code) => page.evaluate(([t, c]) => (window as any).__swfPlay.key(t as 'keyDown' | 'keyUp', c as number), [type, code] as const),
    click: (x, y) => page.evaluate(([a, b]) => (window as any).__swfPlay.click(a, b), [x, y] as const),
    inspect: async () => {
      // The hook's methods are functions, so the page evaluates them and returns the plain parts.
      const data = await page.evaluate(() => {
        const i = (window as any).__swfPlay.inspect();
        const names = new Set<string>();
        const walk = (list: Array<{ className: string; children: any[] }>): void => {
          for (const s of list) {
            names.add(s.className);
            walk(s.children);
          }
        };
        const tree = i.stageChildren();
        walk(tree);
        const found: Record<string, unknown[]> = {};
        for (const n of names) found[n] = i.find(n);
        return { tick: i.tick, tree, found, timers: i.timers() };
      });
      return {
        tick: data.tick,
        find: (name: string) => (data.found[name] ?? []) as ReturnType<Inspection['find']>,
        stageChildren: () => data.tree,
        timers: () => data.timers,
      };
    },
    errors: () => page.evaluate(() => (window as any).__swfPlay.errors()),
  };
}
