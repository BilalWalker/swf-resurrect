// Play_Test scenarios (as3-coverage Requirement 25): one function per game over a PlayDriver, so the Node and the
// Chromium layer run the same steps and the same assertions. Every assertion reads observable state through the
// inspection hook; a failure message names the state that was reached (Requirement 25.8).
import { entityGameScript } from './playScript';
import type { PlayDriver } from './playDriver';
import type { Snapshot } from '../../template/runtime/inspect';

/** Source of a seeded Math.random, run once in the page (Chromium) or in this process (Node) before the game loads. */
export const SEED_MATH_RANDOM = `(() => { let s = 12345; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

export const STEPS_30_SECONDS = 900;
const KEY = { left: 37, up: 38, space: 32 } as const;

export interface PlayOutcome {
  firstHit: { tick: number; bullet: { x: number; y: number }; removed: number; added: number; age: number } | null; // removed/added: sprites near the bullet before and after
  bulletsSeen: number;
  endState: string;
}

class Failure extends Error {}
function check(cond: boolean, what: string, state: unknown): void {
  if (!cond) throw new Failure(`${what}\nstate reached: ${JSON.stringify(state)}`);
}

/** The game's display objects that are drawn by code: the Sprite children of the game root. */
function sprites(tree: Snapshot[]): Snapshot[] {
  const game = tree.find((s) => s.className === 'AsteroidsGame');
  return game === undefined ? [] : game.children.filter((c) => c.className === 'Sprite');
}
const near = (a: { x: number; y: number }, b: { x: number; y: number }, d: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= d;

/** entity_game (Asteroids). Needs Math.random seeded before the page or the Player is created. */
export async function playEntityGame(d: PlayDriver): Promise<PlayOutcome> {
  const script = entityGameScript();
  const start = script.entries.find((e) => e.type === 'MouseDown');
  const at = start !== undefined && start.type === 'MouseDown' ? start.pos : [400, 300];
  const tree = async (): Promise<Snapshot[]> => (await d.inspect()).stageChildren();

  // The game is paused until the click: the rocks stay where they are, and the message is shown.
  const before = sprites(await tree());
  check(before.length >= 12, 'the game did not create its entities (10 rocks, ship, enemy)', { sprites: before.length });
  await d.step(5);
  const idle = sprites(await tree());
  check(JSON.stringify(idle.map((s) => [s.x, s.y])) === JSON.stringify(before.map((s) => [s.x, s.y])), 'the game moved before the start click', { before, idle });
  const messages = (await d.inspect()).find('TextField').length;
  check(messages === 1, 'the start message is not on the display list before the click', { textFields: messages });

  // 1. The start click begins the game.
  await d.click(at[0]!, at[1]!);
  await d.step(2);
  const started = sprites(await tree());
  check((await d.inspect()).find('TextField').length === 0, 'the start message is still shown after the click', { sprites: started.length });
  check(JSON.stringify(started.map((s) => [s.x, s.y])) !== JSON.stringify(before.map((s) => [s.x, s.y])), 'nothing moved after the start click', { started });

  // 2. Holding a direction key moves and turns the ship. The ship is the sprite that starts at the stage centre.
  const shipIndex = before.findIndex((s) => s.x === 400 && s.y === 300);
  check(shipIndex >= 0, 'no sprite starts at the stage centre (the ship)', { positions: before.map((s) => [s.x, s.y]) });
  const shipBefore = sprites(await tree())[shipIndex]!;
  await d.key('keyDown', KEY.left);
  await d.key('keyDown', KEY.up);
  await d.step(15);
  const shipAfter = sprites(await tree())[shipIndex]!;
  check(shipAfter.rotation !== shipBefore.rotation, 'holding ArrowLeft did not turn the ship', { shipBefore, shipAfter });
  check(!near(shipAfter, shipBefore, 0.5), 'holding ArrowUp did not move the ship', { shipBefore, shipAfter });
  await d.key('keyUp', KEY.up);

  // 3. The fire key adds a bullet display object; 4. a bullet that overlaps a rock destroys or splits it.
  // Space is read as a press edge that the game sees one tick after the key goes down, so Space is held for 3 ticks and
  // gives one bullet. The ship keeps turning (left held), so successive bullets sweep the circle. Our bullet is the
  // sprite that appears next to the ship; it is followed by its constant velocity. It lives 25 ticks, so one that
  // vanishes earlier met something. Then a sprite near its last position must have been removed (rock destroyed) or
  // a new sprite must have appeared there (rock split).
  let played = 0;
  let bulletsSeen = 0;
  let firstHit: PlayOutcome['firstHit'] = null;
  let sawFire = false;
  for (let burst = 0; burst < 40 && firstHit === null && played < STEPS_30_SECONDS - 40; burst++) {
    let prev = sprites(await tree());
    const ship = prev[shipIndex]!;
    await d.key('keyDown', KEY.space);
    let bullet: { x: number; y: number; vx: number; vy: number; born: number } | null = null;
    let last = prev;
    for (let i = 0; i < 3 && bullet === null; i++) {
      await d.step(1);
      played++;
      last = sprites(await tree());
      const born = matchSprites(prev, last).added.find((s) => near(s, last[shipIndex] ?? ship, 30));
      if (born !== undefined) {
        // Gun.fire: thrust(10) at the ship's angle, so the bullet's velocity is known from the ship's rotation.
        const angle = ((last[shipIndex] ?? ship).rotation * Math.PI) / 180;
        bullet = { x: born.x, y: born.y, vx: Math.sin(-angle) * 10, vy: Math.cos(-angle) * 10, born: played };
      }
      else prev = last;
    }
    await d.key('keyUp', KEY.space);
    if (bullet === null) continue;
    sawFire = true;
    bulletsSeen++;
    let before = last;
    for (let age = 1; age < 18 && firstHit === null; age++) {
      await d.step(1);
      played++;
      const now = sprites(await tree());
      const px = bullet.x + bullet.vx;
      const py = bullet.y + bullet.vy;
      const tol = 8;
      const found = now.find((s) => wrapDist(s.x, s.y, px, py) <= tol);
      if (found !== undefined) {
        bullet.vx = found.x - bullet.x;
        bullet.vy = found.y - bullet.y;
        if (Math.abs(bullet.vx) > 100) bullet.vx -= Math.sign(bullet.vx) * 900; // the game wraps at 900 x 700
        if (Math.abs(bullet.vy) > 100) bullet.vy -= Math.sign(bullet.vy) * 700;
        bullet.x = found.x;
        bullet.y = found.y;
      } else {
        const gone = { x: px, y: py };
        const nearGone = (s: Snapshot): boolean => wrapDist(s.x, s.y, gone.x, gone.y) <= 45;
        // Sprites near the bullet: it and the rock it met (before); the rock or its two halves (now).
        const removed = before.filter(nearGone).length;
        const added = now.filter(nearGone).length;
        firstHit = { tick: played, bullet: gone, removed, added, age };
      }
      before = now;
    }
    await d.step(5); // let the bullet expire
    played += 5;
  }  await d.key('keyUp', KEY.left);
  check(sawFire, 'tapping Space never increased the number of sprites', { bulletsSeen });
  check(bulletsSeen >= 1, 'no bullet appeared', { bulletsSeen });
  check(firstHit !== null, 'no bullet overlapped a rock within the bursts tried', { bulletsSeen, played });
  const hit = firstHit as NonNullable<PlayOutcome['firstHit']>;
  // before = bullet + rock (+ others), after = same count when the rock split (bullet out, half in) or two fewer when it was destroyed.
  check(hit.removed >= 2 && (hit.added === hit.removed || hit.added === hit.removed - 2), 'a bullet overlapped a rock but the rock was neither destroyed nor split', { hit });

  // 5. No error during 30 seconds of play: run the remaining steps.
  await d.step(Math.max(0, STEPS_30_SECONDS - played - 17 - 2));
  const errs = await d.errors();
  check(errs.length === 0, 'the game reported errors during play', { errors: errs.slice(0, 5) });
  const end = await d.inspect();
  check(end.tick >= STEPS_30_SECONDS - 5, 'fewer steps than 30 seconds were played', { tick: end.tick });
  return { firstHit: hit, bulletsSeen, endState: `tick ${end.tick}, ${sprites(end.stageChildren()).length} sprites` };
}

function wrapDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(Math.min(Math.abs(ax - bx), 900 - Math.abs(ax - bx)), Math.min(Math.abs(ay - by), 700 - Math.abs(ay - by)));
}

/** Wrap-aware nearest matching of two sprite lists (the game wraps at 900 x 700). Unmatched ones were removed or added. */
function matchSprites(prev: Snapshot[], now: Snapshot[]): { removed: Snapshot[]; added: Snapshot[] } {
  const dist = (a: Snapshot, b: Snapshot): number => {
    const dx = Math.min(Math.abs(a.x - b.x), 900 - Math.abs(a.x - b.x));
    const dy = Math.min(Math.abs(a.y - b.y), 700 - Math.abs(a.y - b.y));
    return Math.hypot(dx, dy);
  };
  const used = new Set<number>();
  const removed: Snapshot[] = [];
  for (const p of prev) {
    let best = -1;
    let bd = 25;
    now.forEach((n, i) => {
      const dd = dist(p, n);
      if (!used.has(i) && dd <= bd) {
        bd = dd;
        best = i;
      }
    });
    if (best >= 0) used.add(best);
    else removed.push(p);
  }
  return { removed, added: now.filter((_, i) => !used.has(i)) };
}