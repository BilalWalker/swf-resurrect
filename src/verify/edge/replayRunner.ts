// Replay child process (verify design section 6). Run as:
//   node --import tsx src/verify/edge/replayRunner.ts <projectDir> <planJson> <resultJson>
// Everything the Player needs is imported from the Emitted_Project so Player and
// translated classes share one Shim instance. The result goes to a file, never stdout.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ShapeBounds } from '../../../template/runtime/backend';
import type { ReplayPlan } from '../core/replayPlan';
import { formatTraceCall, splitTraceLines } from '../core/traceFormat';
import { FakeBackend } from './fakeBackend';

/** A release over another target than the press: explains a missing `click` (Requirement 14.20). */
export interface ReleaseOutsideNote {
  /** Reference_Input index of the MouseUp. */
  upIndex: number;
  /** Reference_Input index of the MouseDown that set the Pressed_Target. */
  downIndex: number;
  /** describeTarget(Pressed_Target). */
  pressed: string;
  /** describeTarget(Hit_Target at release). */
  hit: string;
  tick: number;
}

export interface ReplayRunnerResult {
  lines: Array<{ tick: number; text: string }>;
  ticksRun: number;
  error: { tick: number; message: string } | null;
  releaseOutside: ReleaseOutsideNote[];
  /** Caught_Errors in order of occurrence (Requirement 25.7); absent in an old result file: empty. */
  caughtErrors?: Array<{ tick: number; site: string; message: string }>;
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
  const releaseOutside: ReleaseOutsideNote[] = [];
  const caughtErrors: NonNullable<ReplayRunnerResult['caughtErrors']> = [];
  let downIndex: number | null = null;
  let setTraceSink: ((fn: ((...args: unknown[]) => void) | null) => void) | null = null;

  try {
    const [playerMod, clockMod, loaderMod, traceMod, internalMod, classesMod, treeMod] = await Promise.all([
      load('runtime/player.ts'),
      load('runtime/clock.ts'),
      load('runtime/loader.ts'),
      load('shim/trace.ts'),
      load('shim/internal.ts'),
      load('src/classes.ts'),
      load('runtime/stageTree.ts'),
    ]);
    setTraceSink = traceMod.setTraceSink;

    const readText = (rel: string): string => readFileSync(resolve(projectDir, rel), 'utf8');

    // Shape bounds from Scene_JSON size and origin, before loadScene, so FakeBackend.loadShape returns them.
    const backend = new FakeBackend();
    const rawScene = JSON.parse(readText('assets/scene.json')) as {
      symbols: Record<string, { type: string; origin?: { x: number; y: number }; size?: { width: number; height: number } }>;
    };
    for (const [key, sym] of Object.entries(rawScene.symbols)) {
      if (sym.type !== 'shape' || sym.origin === undefined || sym.size === undefined) continue;
      const b: ShapeBounds = { x: -sym.origin.x, y: -sym.origin.y, width: sym.size.width, height: sym.size.height };
      backend.shapeBounds.set(Number(key), b);
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
      // Recorded with the current tick; the Replay keeps ticking (Requirement 25.7).
      onCaughtError: (c: { site: string; message: string }) => {
        caughtErrors.push({ tick, site: c.site, message: c.message });
      },
    });

    for (tick = 0; tick < plan.tickCount; tick++) {
      if (tick === 0) internalMod.exitFrame(player.root);
      else {
        clock.advance(player.frameIntervalMs);
        player.update();
      }
      for (const p of plan.pointers) {
        if (p.tick !== tick) continue;
        if (p.kind === 'move') player.dispatchMouseMove(p.x, p.y);
        else if (p.kind === 'down') {
          player.dispatchMouseDown(p.x, p.y);
          // A repeated down is ignored by the Player and does not set a Pressed_Target.
          if (!p.unpaired) downIndex = p.index;
        } else {
          const outcome = player.dispatchMouseUp(p.x, p.y);
          if (outcome.releaseOutside !== null && downIndex !== null) {
            releaseOutside.push({
              upIndex: p.index,
              downIndex,
              pressed: treeMod.describeTarget(outcome.releaseOutside.pressed),
              hit: treeMod.describeTarget(outcome.releaseOutside.hit),
              tick,
            });
          }
        }
      }
      ticksRun = tick + 1;
    }
  } catch (e) {
    error = { tick, message: e instanceof Error ? e.message : String(e) };
  } finally {
    setTraceSink?.(null);
  }
  const result: ReplayRunnerResult = { lines, ticksRun, error, releaseOutside, caughtErrors };
  writeFileSync(resultPath, JSON.stringify(result), 'utf8');
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exitCode = 1;
});
