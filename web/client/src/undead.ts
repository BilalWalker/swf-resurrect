// The far-off dead: small silhouettes that climb out of a grave on one of the backdrop's ridges, shamble
// along it and sink back into the ground somewhere else. Decorative only; nothing here reads or changes
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
}

const RIDGES: Ridge[] = [
  {
    // the left ridge, from below the chapel down to the valley
    points: [[24, 29.2], [28, 30.0], [30, 31.3], [32, 32.6], [34, 32.7], [36, 33.9], [40, 35.1], [42, 35.5], [44, 36.7], [46, 37.6], [48, 38.4], [52, 38.6], [54, 39.4], [58, 41.2], [60, 41.4], [62, 42.8]],
    size: 5.8,
  },
  {
    // the right ridge, from the valley up to the tree
    points: [[70, 39.7], [72, 39.6], [76, 38.4], [78, 35.6], [80, 35.6], [82, 34.8], [84, 33.2], [86, 32.4], [88, 31.9], [90, 31.6], [92, 31.1], [94, 31.0], [96, 32.2]],
    size: 5.6,
  },
  {
    // the chapel hill, further away
    points: [[5, 32.5], [7, 32.0], [9, 30.9], [11, 30.0], [13, 29.3], [15, 28.2]],
    size: 4.4,
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

const MAX_AT_ONCE = 3;

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

/** Starts the wandering dead inside `scene` (the element that has the backdrop's box). Returns a stop function. */
export function raiseTheDead(scene: HTMLElement): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  const walkers: Walker[] = [];
  let nextSpawn = performance.now() + rand(1500, 4000);
  let last = performance.now();
  let handle = 0;

  const spawn = (now: number): void => {
    const ridge = RIDGES[Math.floor(Math.random() * RIDGES.length)];
    const t = rand(0.08, 0.92);
    // Walk at least a fifth of the ridge, toward whichever end leaves room.
    const dir = t < 0.3 ? 1 : t > 0.7 ? -1 : Math.random() < 0.5 ? 1 : -1;
    const target = Math.min(0.96, Math.max(0.04, t + dir * rand(0.22, 0.5)));
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
    if (now >= nextSpawn) {
      if (walkers.length < MAX_AT_ONCE) spawn(now);
      nextSpawn = now + rand(5000, 11000);
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
    for (const w of walkers) w.el.remove();
    walkers.length = 0;
  };
}
