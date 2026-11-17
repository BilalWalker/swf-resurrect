// spacer Play_Test scenario (as3-coverage task 31, Requirement 25.2): one function over a PlayDriver, so the Node and the
// Chromium layer run the same steps and assertions. It plays spacerScript() for 300 ticks (start, move, shoot, pause) and then
// hunts: it aims at a Fly, holds the mouse, pauses once more, and follows one Fly through its death animation until it leaves
// the display list. Every assertion reads observable state through the inspection hook; a failure names the state reached.
// Rules read from the decompiled source (.work/gaps/work-spacer/scripts): Utils.as (keys, borders), LevelScene.as (bounds, pause,
// spawn Timer of 10000 ms), Player.as, Fly.as (labels "destroyed" and "destroyedComplete"; Sprite.die() hides it, LevelScene removes it).
import { fileURLToPath } from 'node:url';
import type { Snapshot } from '../../template/runtime/inspect';
import type { PlayDriver } from './playDriver';
import { spacerScript, type PlayScript, type ScriptEntry } from './playScript';

export const SPACER_STEPS = 1800; // 30 seconds at 60 fps

/** The hand-written classes the spacer project needs (Requirement 28.13); the Play_Test skips without them. */
export const HANDWRITTEN_SPACER = fileURLToPath(new URL('../../handwritten/spacer', import.meta.url));

/** Named_Limits a 30 second spacer play raises, as measured (task 31). A new id here is a change to look at, not to wave through. */
export const SPACER_EXPECTED_NAMED_LIMITS: string[] = [
  'collision-coverage-mask', // PhysicEngine (hand-written) calls pixelsOverlap
  'stage-scaleMode', // Main: stage.scaleMode = StageScaleMode.NO_SCALE
  'useWeakReference-ignored', // Main: addEventListener(..., false, 0, true)
];

/** Utils.as: LEFT_BORDER 15, RIGHT_BORDER 15, TOP_BORDER 130, BOTTOM_BORDER 30; stage 800 x 700. */
export const SCENE_BOUNDS = { left: 15, right: 785, top: 130, bottom: 670 } as const;

const KEY_CODES: Record<string, number> = { Enter: 13, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, w: 87, a: 65, s: 83, d: 68 };
function codeOf(e: Extract<ScriptEntry, { type: 'KeyDown' | 'KeyUp' }>): number {
  const name = typeof e.key === 'string' ? e.key : e.key.Char;
  const code = KEY_CODES[name];
  if (code === undefined) throw new Error(`no key code for ${name}`);
  return code;
}

export interface FlyDeath {
  name: string;
  /** Observed (tick, frame, label) from the first sighting to the last. */
  trace: Array<{ tick: number; frame: number; label: string }>;
  hitTick: number;
  goneTick: number;
}
export interface SpacerOutcome {
  startTick: number;
  bulletsMax: number;
  playerMoves: Record<string, { from: [number, number]; to: [number, number] }>;
  pauses: Array<{ tick: number; pausedLabel: boolean; runningTimersWhilePaused: number; runningTimersAfter: number }>;
  death: FlyDeath;
  flyPauseMoved: { frozen: boolean; movedAfter: boolean };
  namedLimits: string[];
  endState: string;
}

class Failure extends Error {}
function check(cond: boolean, what: string, state: unknown): asserts cond {
  if (!cond) throw new Failure(`${what}\nstate reached: ${JSON.stringify(state)}`);
}

const topsOf = (tree: Snapshot[], className: string): Snapshot[] => tree.filter((s) => s.className === className);

/** Replays the entries of a PlayScript one tick at a time; a Wait (or the end of the entries) ends a tick. */
class Runner {
  private index = 0;
  tick = 0;
  constructor(
    private readonly d: PlayDriver,
    private readonly script: PlayScript,
    private readonly onTick: (tree: Snapshot[], tick: number) => void,
  ) {}
  get done(): boolean {
    return this.tick >= this.script.ticks;
  }
  async oneTick(): Promise<void> {
    const entries = this.script.entries;
    while (this.index < entries.length) {
      const e = entries[this.index++]!;
      if (e.type === 'Wait') break;
      await this.apply(e);
    }
    await this.step();
  }
  async step(): Promise<void> {
    await this.d.step(1);
    this.tick++;
    this.onTick((await this.d.inspect()).stageChildren(), this.tick);
  }
  async runTo(tick: number): Promise<void> {
    while (this.tick < tick && !this.done) await this.oneTick();
    while (this.tick < tick) await this.step();
  }
  private async apply(e: ScriptEntry): Promise<void> {
    if (e.type === 'KeyDown') await this.d.key('keyDown', codeOf(e));
    else if (e.type === 'KeyUp') await this.d.key('keyUp', codeOf(e));
    else if (e.type === 'MouseMove') await this.d.mouse('move', e.pos[0], e.pos[1]);
    else if (e.type === 'MouseDown') await this.d.mouse('down', e.pos[0], e.pos[1]);
    else if (e.type === 'MouseUp') await this.d.mouse('up', e.pos[0], e.pos[1]);
  }
}

/** Frames of the Fly symbol's labels, read from the project's assets/scene.json (the symbol linked to the class Fly). */
export interface FlyLabels {
  destroyed: number;
  destroyedComplete: number;
  totalFrames: number;
}
export function flyLabelsOf(sceneJson: string): FlyLabels {
  const scene = JSON.parse(sceneJson) as { symbols: Record<string, { className?: string; frameCount?: number; labels?: Array<{ frame: number; name: string }> }> };
  const fly = Object.values(scene.symbols).find((s) => s.className === 'Fly');
  const at = (name: string): number => fly?.labels?.find((l) => l.name === name)?.frame ?? -1;
  return { destroyed: at('destroyed'), destroyedComplete: at('destroyedComplete'), totalFrames: fly?.frameCount ?? -1 };
}

export async function playSpacer(d: PlayDriver, flyLabels: FlyLabels): Promise<SpacerOutcome> {
  const script = spacerScript();
  let bulletsMax = 0;
  let lastTree: Snapshot[] = [];
  const outOfBounds: unknown[] = [];
  const history = new Map<string, Array<{ tick: number; frame: number; label: string }>>();
  const onTick = (tree: Snapshot[], tick: number): void => {
    lastTree = tree;
    bulletsMax = Math.max(bulletsMax, topsOf(tree, 'Bullet').length);
    // The game's player is the first Player on the Stage (LevelScene.addPlayer); the second is the Infobar's lives icon.
    for (const p of topsOf(tree, 'Player').slice(0, 1)) {
      // Player.x is its registration point; PhysicEngine keeps it half a width inside the borders, so the borders bound it.
      if (p.x < SCENE_BOUNDS.left || p.x > SCENE_BOUNDS.right || p.y < SCENE_BOUNDS.top || p.y > SCENE_BOUNDS.bottom) outOfBounds.push({ tick, x: p.x, y: p.y });
    }
    for (const f of topsOf(tree, 'Fly')) {
      const h = history.get(f.name) ?? [];
      h.push({ tick, frame: f.frame, label: f.label });
      history.set(f.name, h);
    }
  };
  const r = new Runner(d, script, onTick);
  const summary = (): Record<string, unknown> => ({
    tick: r.tick,
    top: lastTree.map((s) => `${s.className}:${s.name}@${Math.round(s.x)},${Math.round(s.y)}f${s.frame}${s.label === '' ? '' : `/${s.label}`}`),
  });
  const player = (): Snapshot | undefined => topsOf(lastTree, 'Player')[0];
  const runningTimers = async (): Promise<number> => (await d.inspect()).timers().filter((t) => t.running && t.delay !== 500).length;

  // (a) Title screen, then Enter starts the level (Main.loop: TitleScene.shouldLevelStart; hasLevelStarted; gotoAndStop(1, "Szene 2")).
  await r.runTo(4);
  check(topsOf(lastTree, 'StartLabel').length === 1 && topsOf(lastTree, 'Player').length === 0, 'the start screen is not shown before Enter', summary());
  await r.runTo(14);
  check(player() !== undefined, 'Enter did not start the level: no Player on the Stage', summary());
  check(topsOf(lastTree, 'StartLabel').length === 0, 'the start label is still on the Stage after Enter', summary());
  const startTick = r.tick;

  // (b) Each movement key moves the player (and the whole run keeps it in the scene bounds, checked every tick).
  const moves: SpacerOutcome['playerMoves'] = {};
  const phase = async (name: string, from: number, to: number, moved: (a: Snapshot, b: Snapshot) => boolean): Promise<void> => {
    await r.runTo(from + 1);
    const a = player();
    await r.runTo(to + 1);
    const b = player();
    check(a !== undefined && b !== undefined, `no Player during ${name}`, summary());
    moves[name] = { from: [a.x, a.y], to: [b.x, b.y] };
    check(moved(a, b), `${name} did not move the player the expected way`, { ...summary(), from: [a.x, a.y], to: [b.x, b.y] });
  };
  await phase('ArrowRight', 60, 90, (a, b) => b.x > a.x + 10);
  await phase('ArrowDown', 90, 110, (a, b) => b.y > a.y + 5);
  await phase('ArrowLeft', 110, 140, (a, b) => b.x < a.x - 10);
  await phase('ArrowUp', 140, 160, (a, b) => b.y < a.y - 5);
  await phase('w', 162, 166, (a, b) => b.y < a.y);
  await phase('d', 166, 170, (a, b) => b.x > a.x);
  await phase('s', 170, 174, (a, b) => b.y > a.y);
  await phase('a', 174, 178, (a, b) => b.x < a.x);

  // (c) The left mouse button shoots: Bullet objects appear on the Stage while it is held (script ticks 182..220).
  await r.runTo(181);
  check(topsOf(lastTree, 'Bullet').length === 0, 'a Bullet exists before the mouse button is pressed', summary());
  await r.runTo(225);
  check(bulletsMax >= 2, 'holding the left mouse button did not spawn bullets', { bulletsMax, ...summary() });

  // (e, script part) Escape pauses and resumes: the PauseLabel shows, the spawn Timer stops, and it runs again after resume.
  const pauses: SpacerOutcome['pauses'] = [];
  const beforePause = await runningTimers();
  check(beforePause >= 1, 'no spawn Timer is running before the pause', { timers: (await d.inspect()).timers(), ...summary() });
  await r.runTo(245);
  const pausedLabel = topsOf(lastTree, 'PauseLabel').length === 1;
  const whilePaused = await runningTimers();
  check(pausedLabel, 'Escape did not show the PauseLabel', summary());
  check(whilePaused === 0, 'a Timer other than the cooldown still runs while paused', { timers: (await d.inspect()).timers(), ...summary() });
  await r.runTo(285);
  const afterTimers = await runningTimers();
  check(topsOf(lastTree, 'PauseLabel').length === 0, 'the second Escape did not resume (PauseLabel still on the Stage)', summary());
  check(afterTimers >= 1, 'the spawn Timer does not run after resume', { timers: (await d.inspect()).timers(), ...summary() });
  pauses.push({ tick: 230, pausedLabel, runningTimersWhilePaused: whilePaused, runningTimersAfter: afterTimers });

  // (b, bounds) Hold ArrowLeft + ArrowUp until the player stops at the top-left corner: it reaches the borders (half its size
  // inside them, PhysicEngine.applySceneBounds) and never passes them (checked every tick by onTick).
  await r.runTo(script.ticks);
  await d.key('keyDown', 37);
  await d.key('keyDown', 38);
  for (let i = 0; i < 150; i++) await r.step();
  await d.key('keyUp', 37);
  await d.key('keyUp', 38);
  const corner = player();
  check(corner !== undefined && corner.x - SCENE_BOUNDS.left < 40 && corner.y - SCENE_BOUNDS.top < 40, 'holding ArrowLeft and ArrowUp did not bring the player to the top-left border', summary());
  await r.step();
  const stopped = player()!;
  check(Math.abs(stopped.x - corner.x) < 1 && Math.abs(stopped.y - corner.y) < 1, 'the player did not stop at the border', { corner, stopped });

  // (d, e) Hunt: the first Fly appears about 10 s after the start. Aim at the nearest live Fly, hold the button, pause once, and
  // follow one Fly through its death.
  let held = false;
  const aimAt = async (f: Snapshot | undefined): Promise<void> => {
    if (f === undefined) {
      if (held) await d.mouse('up', 600, 300);
      held = false;
      return;
    }
    await d.mouse('move', f.x, f.y);
    if (!held) await d.mouse('down', f.x, f.y);
    held = true;
  };
  const liveFlies = (): Snapshot[] => topsOf(lastTree, 'Fly').filter((f) => f.label !== 'destroyed' && f.label !== 'destroyedComplete');
  const nearest = (): Snapshot | undefined => {
    const p = player();
    if (p === undefined) return undefined;
    return liveFlies().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  };
  let flyPause: SpacerOutcome['flyPauseMoved'] | null = null;
  let flyPauseTried = false;
  let hitTick = -1;
  let deathName: string | null = null;
  let goneTick = -1;
  while (r.tick < SPACER_STEPS) {
    await aimAt(nearest());
    await r.step();
    // The first sighting of "destroyed" fixes the Fly whose death is followed.
    if (deathName === null) {
      const dying = topsOf(lastTree, 'Fly').find((f) => f.label === 'destroyed');
      if (dying !== undefined) {
        deathName = dying.name;
        hitTick = r.tick;
      }
    } else if (goneTick < 0 && !topsOf(lastTree, 'Fly').some((f) => f.name === deathName)) {
      goneTick = r.tick;
    }
    // (e, fly part) one pause while Flies are alive and none dies: they stand still, then move again after resume.
    if (!flyPauseTried && deathName === null && liveFlies().length >= 1 && r.tick > 700) {
      flyPauseTried = true;
      if (held) await d.mouse('up', 0, 0);
      held = false;
      const before = topsOf(lastTree, 'Fly').map((f) => [f.name, f.x, f.y] as const);
      await d.key('keyDown', 27);
      await r.step();
      await d.key('keyUp', 27);
      await r.step();
      const running = await runningTimers();
      const frozenFrom = topsOf(lastTree, 'Fly').map((f) => [f.name, f.x, f.y] as const);
      for (let i = 0; i < 20; i++) await r.step();
      const frozenTo = topsOf(lastTree, 'Fly').map((f) => [f.name, f.x, f.y] as const);
      check(topsOf(lastTree, 'PauseLabel').length === 1, 'the pause key did not pause while Flies were alive', summary());
      check(frozenFrom.length >= 1 && JSON.stringify(frozenFrom) === JSON.stringify(frozenTo), 'a Fly moved while the game was paused', { frozenFrom, frozenTo });
      check(running === 0, 'a Timer other than the cooldown runs while paused (Flies alive)', { timers: (await d.inspect()).timers(), ...summary() });
      // Resume: the cooldown (500 ms) must have ended; wait 40 ticks before the key.
      for (let i = 0; i < 30; i++) await r.step();
      await d.key('keyDown', 27);
      await r.step();
      await d.key('keyUp', 27);
      for (let i = 0; i < 20; i++) await r.step();
      check(topsOf(lastTree, 'PauseLabel').length === 0, 'the game did not resume after the second pause key', summary());
      const afterResume = topsOf(lastTree, 'Fly').map((f) => [f.name, f.x, f.y] as const);
      const movedAfter = afterResume.some((a) => !frozenTo.some((b) => b[0] === a[0] && b[1] === a[1] && b[2] === a[2]));
      check(movedAfter, 'no Fly moved after resume', { frozenTo, afterResume });
      flyPause = { frozen: before.length >= 1, movedAfter };
    }
    if (goneTick >= 0 && r.tick >= goneTick + 5 && flyPauseTried) break;
  }
  if (held) await d.mouse('up', 0, 0);

  check(flyPause !== null, 'no Fly was alive in the hunt phase for the pause check (the first Fly spawns about 10 s after the start)', summary());
  check(deathName !== null, 'no Fly was hit: none reached its "destroyed" label within 30 seconds', { flies: [...history.keys()], ...summary() });
  const trace = history.get(deathName)!;
  check(goneTick >= 0, `the Fly ${deathName} was hit (label "destroyed" at tick ${hitTick}) but never left the display list`, { trace: trace.slice(-12), ...summary() });
  // Fly.animateDeath: gotoAndPlay("destroyed"), then each tick one frame on; on the tick the clip reaches "destroyedComplete"
  // (its last frame) the enterFrame code stops it, Sprite.die() hides it and LevelScene.removeFly takes it off the Stage, all
  // before the tick ends. So the last frame seen between ticks is the one before "destroyedComplete", seen on the tick before
  // the Fly (same instance name) disappears.
  const since = trace.filter((t) => t.tick >= hitTick);
  check(since[0]!.frame === flyLabels.destroyed && since[0]!.label === 'destroyed', `the death of ${deathName} did not start at "destroyed"`, { trace: since.slice(0, 3) });
  check(since.every((t, i) => i === 0 || (t.frame === since[i - 1]!.frame + 1 && t.tick === since[i - 1]!.tick + 1)), `the death animation of ${deathName} did not advance one frame per tick`, { since });
  const last = since[since.length - 1]!;
  check(last.frame === flyLabels.destroyedComplete - 1 && flyLabels.destroyedComplete === flyLabels.totalFrames, `the last sighting of ${deathName} is not the frame before "destroyedComplete" (its last frame)`, { last, flyLabels });
  check(goneTick === last.tick + 1, `${deathName} did not leave the display list on the tick it reached its last frame`, { lastTick: last.tick, goneTick });
  check(!topsOf(lastTree, 'Fly').some((f) => f.name === deathName), `${deathName} came back to the display list`, summary());

  // (f) 30 seconds without a caught error; the player stayed inside the borders every tick.
  while (r.tick < SPACER_STEPS) await r.step();
  check(outOfBounds.length === 0, 'the player left the scene bounds', { first: outOfBounds.slice(0, 3) });
  const errs = await d.errors();
  check(errs.length === 0, 'the game reported errors during play', { errors: errs.slice(0, 5) });
  const end = await d.inspect();
  check(end.tick >= SPACER_STEPS - 5, 'fewer steps than 30 seconds were played', { tick: end.tick });
  return {
    startTick,
    bulletsMax,
    playerMoves: moves,
    pauses,
    death: { name: deathName, trace, hitTick, goneTick },
    flyPauseMoved: flyPause,
    namedLimits: (await d.namedLimits()).sort(),
    endState: `tick ${end.tick}, ${lastTree.length} Stage children`,
  };
}
