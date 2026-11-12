// Replay child process (verify design section 6). Run as:
//   node --import tsx src/verify/edge/replayRunner.ts <projectDir> <planJson> <resultJson>
// Everything the Player needs is imported from the Emitted_Project so Player and
// translated classes share one Shim instance. The result goes to a file, never stdout.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ShapeBounds } from '../../../template/runtime/backend';
import type { PlannedPointer, ReplayPlan } from '../core/replayPlan';
import { svgShapeBounds } from '../core/svgBounds';
import { formatTraceCall, splitTraceLines } from '../core/traceFormat';
import { FakeBackend } from './fakeBackend';

export interface ReplayRunnerResult {
  lines: Array<{ tick: number; text: string }>;
  ticksRun: number;
  error: { tick: number; message: string } | null;
}

async function main(): Promise<void> {
  const [projectArg, planPath, resultPath] = process.argv.slice(2);
  if (projectArg === undefined || planPath === undefined || resultPath === undefined) {
    throw new Error('usage: replayRunner <projectDir> <planJson> <resultJson>');
  }
  const projectDir = resolve(projectArg);
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as ReplayPlan;
  const load = (rel: string): Promise<any> => import(pathToFileURL(resolve(projectDir, rel)).href);

  const lines: ReplayRunnerResult['lines'] = [];
  let tick = 0;
  let ticksRun = 0;
  let error: ReplayRunnerResult['error'] = null;
  let setTraceSink: ((fn: ((...args: unknown[]) => void) | null) => void) | null = null;

  try {
    const [playerMod, clockMod, loaderMod, traceMod, internalMod, classesMod] = await Promise.all([
      load('runtime/player.ts'),
      load('runtime/clock.ts'),
      load('runtime/loader.ts'),
      load('shim/trace.ts'),
      load('shim/internal.ts'),
      load('src/classes.ts'),
    ]);
    setTraceSink = traceMod.setTraceSink;

    const readText = (rel: string): string => readFileSync(resolve(projectDir, rel), 'utf8');

    // Shape bounds from the SVGs, before loadScene, so FakeBackend.loadShape returns them.
    const backend = new FakeBackend();
    const rawScene = JSON.parse(readText('assets/scene.json')) as {
      symbols: Record<string, { type: string; file?: string; origin?: { x: number; y: number } }>;
    };
    for (const [key, sym] of Object.entries(rawScene.symbols)) {
      if (sym.type !== 'shape' || sym.file === undefined || sym.origin === undefined) continue;
      const b = svgShapeBounds(readText(`assets/${sym.file}`), sym.origin);
      if (b !== null) backend.shapeBounds.set(Number(key), b as ShapeBounds);
    }

    const loaded = await loaderMod.loadScene(async (url: string) => readText(url), backend);
    if (loaded === null) throw new Error(`scene load failed: ${backend.errors.join('; ')}`);

    // The sink is installed before the Player: its constructor runs the frame-1 scripts.
    traceMod.setTraceSink((...args: unknown[]) => {
      for (const t of splitTraceLines(formatTraceCall(args))) lines.push({ tick, text: t });
    });

    const clock = new clockMod.ManualClock();
    const player = new playerMod.Player({
      scene: loaded.scene,
      backend,
      clock,
      classRegistry: classesMod.classRegistry,
      shapeBounds: loaded.shapeBounds,
    });

    for (tick = 0; tick < plan.tickCount; tick++) {
      if (tick === 0) internalMod.exitFrame(player.root);
      else {
        clock.advance(player.frameIntervalMs);
        player.update();
      }
      for (const c of clicksOf(plan.pointers)) if (c.tick === tick) player.dispatchClick(c.x, c.y);
      ticksRun = tick + 1;
    }
  } catch (e) {
    error = { tick, message: e instanceof Error ? e.message : String(e) };
  } finally {
    setTraceSink?.(null);
  }
  const result: ReplayRunnerResult = { lines, ticksRun, error };
  writeFileSync(resultPath, JSON.stringify(result), 'utf8');
}

/** Interim until sub-task 7.4: pairs a valid press and release at one position into a click. */
function clicksOf(pointers: readonly PlannedPointer[]): Array<{ tick: number; x: number; y: number }> {
  const out: Array<{ tick: number; x: number; y: number }> = [];
  let down: PlannedPointer | null = null;
  for (const p of pointers) {
    if (p.kind === 'down') down = p;
    else if (p.kind === 'up') {
      if (down !== null && down.x === p.x && down.y === p.y) out.push({ tick: p.tick, x: p.x, y: p.y });
      down = null;
    }
  }
  return out;
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exitCode = 1;
});
