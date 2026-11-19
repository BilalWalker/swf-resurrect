// A resurrection on the far hill, now and then: a violet glow rises behind the chapel, a few small
// silhouettes climb out of the graves in front of it, shamble a little way and sink back, and the glow
// fades. Then the scene is still again for a while. Decorative only; nothing here reads or changes
// application state.

/** Frames in art/zombie-sheet.png: 0 to 5 climb out of the ground, 6 to 11 are one walk cycle. Faces right. */
const FRAMES = 12;
const RISE = [0, 1, 2, 3, 4, 5];
const WALK = [6, 7, 8, 9, 10, 11];
const RISE_MS = 230;
const WALK_MS = 170;

/**
 * A ridge of the backdrop: the ground line as points in picture percentages (x, y), traced from the picture
 * itself (the sky-to-hill edge, ignoring the stones and trees that stand on it). x runs from the first point
 * to the last; y is interpolated between neighbours.
 */
interface Ridge {
  points: ReadonlyArray<readonly [number, number]>;
  /** Figure height as a percentage of the picture height: further ridges carry smaller figures. */
  size: number;
  /** The stretch of the ridge (fractions by x) lit by the glow, where the dead may come up. */
  span: readonly [number, number];
}

/**
 * Only the chapel hill: the ridge right of the chapel lies behind the page heading at common desktop widths
 * (measured at 1600 px: heading x 242-777, ridge x 376-632), so figures there were hidden or looked lost.
 */
const RIDGES: Ridge[] = [
  {
    // the chapel hill, further away
    points: [[5, 32.5], [7, 32.0], [9, 30.9], [11, 30.0], [13, 29.3], [15, 28.2]],
    size: 4.4,
    span: [0.2, 0.95],
  },
];

/** How far below the traced edge the feet stand, in picture percent, so they are planted in the hill and never hover. */
const SINK = 0.5;

/** Picture position of fraction `t` (0 to 1, by x) along a ridge. */
function ridgeAt(r: Ridge, t: number): [number, number] {
  const p = r.points;
  const x = p[0][0] + (p[p.length - 1][0] - p[0][0]) * t;
  let i = 1;
  while (i < p.length - 1 && p[i][0] < x) i++;
  const [ax, ay] = p[i - 1];
  const [bx, by] = p[i];
  return [x, ay + ((by - ay) * (x - ax)) / (bx - ax) + SINK];
}

/** Quiet time between two resurrections, and how long the glow burns before the first figure comes up. */
const QUIET_MS: readonly [number, number] = [11000, 20000];
const GLOW_LEAD_MS = 1600;

interface Walker {
  el: HTMLElement;
  ridge: Ridge;
  /** Position along the ridge, 0 to 1. */
  t: number;
  target: number;
  /** Ridge fraction covered per second. */
  speed: number;
  phase: 'rise' | 'walk' | 'sink';
  frame: number;
  frameAt: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

function place(w: Walker): void {
  const [x, y] = ridgeAt(w.ridge, w.t);
  w.el.style.left = `${x}%`;
  w.el.style.top = `${y}%`;
}

function show(w: Walker, frame: number): void {
  w.el.style.backgroundPositionX = `${(frame / (FRAMES - 1)) * 100}%`;
}

/** Starts the resurrections inside `scene` (the element that has the backdrop's box). Returns a stop function. */
export function raiseTheDead(scene: HTMLElement): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  // The glow sits first in the scene, so the figures stand in front of it, black against the light.
  const glow = document.createElement('span');
  glow.className = 'resurrection';
  scene.prepend(glow);
  const walkers: Walker[] = [];
  let lit = false;
  /** Figures still to come up in this resurrection, and when the next one does. */
  let toRaise = 0;
  let nextSpawn = performance.now() + rand(2500, 5000);
  let last = performance.now();
  let handle = 0;

  const spawn = (now: number): void => {
    const ridge = RIDGES[Math.floor(Math.random() * RIDGES.length)];
    const [lo, hi] = ridge.span;
    const t = rand(lo, hi);
    // A short shamble inside the lit stretch, toward whichever end leaves more room.
    const dir = t - lo < hi - t ? 1 : -1;
    const target = Math.min(hi, Math.max(lo, t + dir * rand(0.1, 0.22) * (hi - lo) * 2.5));
    const el = document.createElement('span');
    el.className = 'undead';
    el.style.height = `${ridge.size * rand(0.88, 1.12)}%`;
    // The sheet faces right; flip when the walk goes left on screen.
    const goesRight = target > t; // every ridge is listed left to right
    el.style.transform = `translate(-50%, -97%) scaleX(${goesRight ? 1 : -1})`;
    const w: Walker = { el, ridge, t, target, speed: rand(0.02, 0.035), phase: 'rise', frame: 0, frameAt: now };
    place(w);
    show(w, RISE[0]);
    scene.append(el);
    walkers.push(w);
  };

  const step = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000); // a tab that was hidden resumes without a jump
    last = now;
    if (!lit && now >= nextSpawn) {
      // the glow comes up first; the dead follow once it burns
      lit = true;
      glow.classList.add('is-lit');
      toRaise = Math.random() < 0.6 ? 2 : Math.random() < 0.5 ? 1 : 3;
      nextSpawn = now + GLOW_LEAD_MS;
    } else if (lit && toRaise > 0 && now >= nextSpawn) {
      spawn(now);
      toRaise--;
      nextSpawn = now + rand(900, 2600);
    } else if (lit && toRaise === 0 && walkers.length === 0) {
      // the last one is back in the ground: the glow dies down and the hill is still for a while
      lit = false;
      glow.classList.remove('is-lit');
      nextSpawn = now + rand(...QUIET_MS);
    }
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      if (w.phase === 'walk') {
        const dir = Math.sign(w.target - w.t);
        w.t += dir * w.speed * dt;
        if ((w.target - w.t) * dir <= 0) {
          w.t = w.target;
          w.phase = 'sink';
          w.frame = RISE.length - 1;
          w.frameAt = now;
          show(w, RISE[w.frame]);
        } else if (now - w.frameAt >= WALK_MS) {
          w.frame = (w.frame + 1) % WALK.length;
          w.frameAt = now;
          show(w, WALK[w.frame]);
        }
        place(w);
      } else if (now - w.frameAt >= RISE_MS) {
        w.frameAt = now;
        if (w.phase === 'rise') {
          w.frame++;
          if (w.frame >= RISE.length) {
            w.phase = 'walk';
            w.frame = 0;
            show(w, WALK[0]);
          } else show(w, RISE[w.frame]);
        } else {
          w.frame--;
          if (w.frame < 0) {
            w.el.remove();
            walkers.splice(i, 1);
          } else show(w, RISE[w.frame]);
        }
      }
    }
    handle = requestAnimationFrame(step);
  };
  handle = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(handle);
    glow.remove();
    for (const w of walkers) w.el.remove();
    walkers.length = 0;
  };
}
