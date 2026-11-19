// Landing view: what the tool does, the sarcophagus (file drop) and the tombstones (samples).
import type { SampleInfo, SetupStatus } from '../../shared/api';
import { api, ApiFailure } from './api';
import { formatBytes, h, svg } from './dom';
import { RITES } from './labels';

export interface LandingDeps {
  openJob(id: string): void;
}

/** Shown instead of the drop zone on a gallery-only host. */
function uploadsOff(): HTMLElement {
  return h(
    'div',
    { class: 'notice uploads-off', role: 'note' },
    h('h2', {}, 'Uploads are disabled on this host'),
    h('p', {}, 'This public demo raises the resident dead below. Every sample opens; the ones marked "Risen before" open at once.'),
    h('p', { class: 'muted' }, 'To convert your own .swf, run SWF Resurrect on your own machine (see the README).'),
  );
}

function setupNotice(setup: SetupStatus): HTMLElement | null {
  if (setup.ready) return null;
  return h(
    'section',
    { class: 'notice is-error', role: 'alert' },
    h('h2', {}, 'The crypt is locked: conversions cannot run on this server yet'),
    ...setup.problems.map((p) => h('p', {}, p)),
    h('p', { class: 'muted' }, 'Samples that were converted before still open from the cache.'),
  );
}

/**
 * Which of the five painted gravestones (1 to 5 in the sheet) sample `index` gets. Shape 2, the cross, has a
 * low plaque that holds a single line only, so a name that breaks into several parts gets the wide slab instead.
 */
function stoneShape(index: number, nameParts: number): number {
  const shape = [1, 3, 5, 2, 4][index % 5];
  return shape === 2 && nameParts > 1 ? 5 : shape;
}

/** art/sarc-anim.webp: 14 frames of the lid opening (0 closed, 13 fully open), 7 per row. */
const SARC_FRAMES = 14;
const SARC_COLS = 7;
const SARC_FRAME_MS = 55;

/**
 * Plays the sarcophagus in the drop zone toward the frame its state asks for, forwards or backwards:
 * closed at rest; fully open on hover or focus, while a file is held over it, and while uploading.
 */
function animateSarcophagus(zone: HTMLElement): void {
  const el = zone.querySelector<HTMLElement>('.sarc');
  if (el === null) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0;
  let hover = false;
  let timer = 0;
  const show = (): void => {
    el.style.backgroundPosition = `${((frame % SARC_COLS) / (SARC_COLS - 1)) * 100}% ${Math.floor(frame / SARC_COLS) * 100}%`;
  };
  // Open all the way or closed, nothing between: a half-open frame freezes the vines in mid-snap.
  const target = (): number =>
    hover || zone.classList.contains('is-busy') || zone.classList.contains('is-over') ? SARC_FRAMES - 1 : 0;
  const step = (): void => {
    const t = target();
    if (frame === t) {
      window.clearInterval(timer);
      timer = 0;
      return;
    }
    frame = still ? t : frame + Math.sign(t - frame);
    show();
  };
  const sync = (): void => {
    if (timer === 0 && frame !== target()) timer = window.setInterval(step, SARC_FRAME_MS);
  };
  for (const [on, off] of [
    ['mouseenter', 'mouseleave'],
    ['focus', 'blur'],
  ]) {
    zone.addEventListener(on, () => {
      hover = true;
      sync();
    });
    zone.addEventListener(off, () => {
      hover = zone.matches(':hover') || zone.matches(':focus-visible');
      sync();
    });
  }
  // is-over and is-busy are set elsewhere in this file; follow them without touching that code
  new MutationObserver(sync).observe(zone, { attributes: true, attributeFilter: ['class'] });
  show();
}

/**
 * Now and then raises the hand beside a random stone for a few seconds, so the yard is never quite still.
 * Stops by itself once the stones leave the page. Does nothing when the visitor asked for reduced motion.
 */
function restlessHands(stones: HTMLElement, hands: GraspingHand[]): void {
  if (hands.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let shown = false; // the list is built before it is put on the page
  const timer = window.setInterval(() => {
    if (!stones.isConnected) {
      if (shown) window.clearInterval(timer);
      return;
    }
    shown = true;
    if (document.hidden || Math.random() < 0.45) return;
    hands[Math.floor(Math.random() * hands.length)].burst();
  }, 3200);
}

/** art/hand-anim.webp: 30 frames, 10 per row. 0 nothing yet, 11 to 17 the hand at full height, 29 gone again. */
const HAND_FRAMES = 30;
const HAND_COLS = 10;
const HAND_HOLD_FROM = 11;
const HAND_HOLD_TO = 17;
/**
 * One pace for every frame, hovered or not: the clip's own rhythm. Hovering used to rush the rise and then
 * slow the frames at full height, and that change of pace read as lag.
 */
const HAND_MOVE_MS = 80;
/** On hover the hand must answer at once: skip the first frames, where the soil is only just cracking. */
const HAND_HOVER_FROM = 5;

interface GraspingHand {
  /** Come up and stay, clawing, until released. */
  rise(): void;
  /** Sink back into the ground. */
  release(): void;
  /** Come up and go straight back down, if it is not already out. */
  burst(): void;
}

/** Drives one hand sprite (landing.css `.grasp`) through its frames. */
function graspingHand(el: HTMLElement): GraspingHand {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0;
  let held = false;
  let sway = 1;
  let timer = 0;
  const show = (): void => {
    el.style.backgroundPosition = `${((frame % HAND_COLS) / (HAND_COLS - 1)) * 100}% ${(Math.floor(frame / HAND_COLS) / (HAND_FRAMES / HAND_COLS - 1)) * 100}%`;
    el.classList.toggle('is-out', frame > 0);
  };
  const tick = (): void => {
    timer = 0;
    if (!el.isConnected) return;
    const holding = held && frame >= HAND_HOLD_FROM && frame <= HAND_HOLD_TO;
    if (holding) {
      // at full height: drift back and forth through the frames there
      if (frame >= HAND_HOLD_TO) sway = -1;
      if (frame <= HAND_HOLD_FROM) sway = 1;
      frame += sway;
    } else {
      frame++;
      if (frame >= HAND_FRAMES) frame = 0;
    }
    show();
    if (frame !== 0) timer = window.setTimeout(tick, HAND_MOVE_MS);
  };
  const start = (): void => {
    if (timer === 0) timer = window.setTimeout(tick, HAND_MOVE_MS);
  };
  return {
    rise: () => {
      held = true;
      if (still) {
        frame = HAND_HOLD_FROM + 2;
        show();
        return;
      }
      if (frame < HAND_HOVER_FROM) {
        frame = HAND_HOVER_FROM;
        show();
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, HAND_MOVE_MS);
    },
    release: () => {
      held = false;
      if (still) {
        frame = 0;
        show();
      } else if (frame > 0) start();
    },
    burst: () => {
      if (frame === 0 && !held && !still) start();
    },
  };
}

/** What a conversion gives you, in the words the result screen itself uses. */
const FEATURES: ReadonlyArray<readonly [string, string]> = [
  ['A real project, not a player', 'TypeScript source with Vite and PixiJS that you can read, change and build. Take it home as a zip.'],
  ['Measured, not promised', 'Every result carries a fidelity report: a pixel match over sampled frames and a trace score from a replay.'],
  ['Old and new, side by side', 'The original plays in Ruffle next to the converted build. Click both and compare.'],
  ['Honest about the dead', 'What could not be converted is listed as staying in the grave, not hidden.'],
];

export async function renderLanding(main: HTMLElement, deps: LandingDeps): Promise<void> {
  main.replaceChildren(h('p', { class: 'loading' }, 'Lighting the lanterns...'));
  let setup: SetupStatus;
  let samples: SampleInfo[];
  try {
    [setup, samples] = await Promise.all([api.setup(), api.samples()]);
  } catch (err) {
    main.replaceChildren(
      h(
        'section',
        { class: 'notice is-error', role: 'alert' },
        h('h2', {}, 'The graveyard is unreachable'),
        h('p', {}, err instanceof Error ? err.message : String(err)),
        h('button', { class: 'btn', type: 'button', onclick: () => void renderLanding(main, deps) }, 'Try again'),
      ),
    );
    return;
  }

  const maxMb = setup.maxUploadBytes / (1024 * 1024);
  const status = h('p', { class: 'drop-status', role: 'status', 'aria-live': 'polite' });
  const input = h('input', { type: 'file', accept: '.swf,application/x-shockwave-flash', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  const zone = h(
    'button',
    {
      type: 'button',
      class: 'dropzone',
      'aria-describedby': 'drop-hint',
    },
    h('span', { class: 'sarc', 'aria-hidden': 'true' }, h('span', { class: 'sarc-smoke' }), h('span', { class: 'sarc-smoke sarc-smoke-2' })),
    h('p', { class: 'drop-title' }, 'Lay a .swf to rest here ', h('span', {}, '...and raise it')),
    h(
      'p',
      { class: 'drop-hint', id: 'drop-hint' },
      `Drop a file, or press Enter to choose one. ActionScript 3 only, up to ${maxMb} MB.`,
    ),
  );

  animateSarcophagus(zone);

  let busy = false;
  const setBusy = (b: boolean): void => {
    busy = b;
    zone.classList.toggle('is-busy', b);
    zone.setAttribute('aria-busy', String(b));
  };
  const fail = (message: string): void => {
    status.className = 'drop-status error-text';
    status.textContent = message;
    setBusy(false);
  };

  const submit = async (file: File): Promise<void> => {
    if (busy) return;
    if (!/\.swf$/i.test(file.name)) return fail(`"${file.name}" is not a .swf file. Only Flash .swf files can be raised.`);
    if (file.size > setup.maxUploadBytes) return fail(`That file is ${formatBytes(file.size)}; the limit is ${maxMb} MB.`);
    if (file.size === 0) return fail('That file is empty.');
    setBusy(true);
    status.className = 'drop-status';
    status.textContent = `Lowering ${file.name} into the grave...`;
    try {
      const { id } = await api.upload(file);
      deps.openJob(id);
    } catch (err) {
      fail(err instanceof ApiFailure ? err.message : 'The upload failed.');
    }
  };

  zone.addEventListener('click', () => {
    if (!busy) input.click();
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f !== undefined) void submit(f);
  });
  let depth = 0;
  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    zone.classList.add('is-over');
    if (!busy) {
      status.className = 'drop-status';
      status.textContent = 'Release to lay it to rest.';
    }
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      zone.classList.remove('is-over');
      if (!busy) status.textContent = '';
    }
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('is-over');
    const files = e.dataTransfer?.files;
    if (files === undefined || files.length === 0) return;
    if (files.length > 1) return fail('One body at a time: drop a single .swf file.');
    void submit(files[0]);
  });

  // The two calls to action under the pitch: the same file picker as the sarcophagus, and a jump to the samples.
  const icon = (d: string): SVGElement => svg(`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`);
  const actions = h(
    'div',
    { class: 'hero-actions' },
    setup.uploadsEnabled
      ? h(
          'button',
          { type: 'button', class: 'btn btn-primary btn-big', onclick: () => { if (!busy) input.click(); } },
          icon('M12 3 6.5 8.5l1.4 1.4L11 6.8V16h2V6.8l3.1 3.1 1.4-1.4L12 3ZM4 18v2h16v-2H4Z'),
          'Resurrect a .SWF',
        )
      : null,
    samples.length > 0
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn btn-big',
            onclick: () => {
              const first = main.querySelector<HTMLElement>('.stone');
              first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              first?.focus({ preventScroll: true });
            },
          },
          icon('M8 5v14l11-7L8 5Z'),
          'See a Sample',
        )
      : null,
  );

  const stones = h('ul', { class: 'stones' });
  const hands: GraspingHand[] = [];
  for (const [i, s] of samples.entries()) {
    const credit = [s.author, s.licence].filter((x) => x !== null).join(' · ');
    const risen = s.cachedJobId !== null;
    // The name may break after "_" or "-"; its size follows its longest part so it fits the stone's face.
    const parts = s.name.split(/(?<=[_-])/);
    const longest = Math.max(...parts.map((p) => p.length));
    const stone = h(
      'button',
      {
        type: 'button',
        class: `stone stone-v${stoneShape(i, parts.length)}${risen ? ' is-risen' : ''}`,
        'aria-label': `Convert sample ${s.name}, ${formatBytes(s.bytes)}${credit !== '' ? `, ${credit}` : ''}${risen ? ', result ready' : ''}`,
      },
      h(
        'span',
        { class: 'stone-face' },
        h('span', { class: 'here-lies', 'aria-hidden': 'true' }, 'HERE LIES'),
        h('span', { class: 'stone-name', style: `--name-chars: ${Math.max(longest, 5)}` }, ...parts.flatMap((p, n) => (n === 0 ? [p] : [h('wbr'), p]))),
        h('span', { class: 'stone-meta' }, formatBytes(s.bytes)),
      ),
      h(
        'span',
        { class: 'stone-plaque', 'aria-hidden': 'true' },
        risen ? h('span', { class: 'stone-risen' }, 'Risen before: opens at once') : null,
        credit !== '' ? h('span', { class: 'stone-credit' }, credit) : null,
      ),
    );
    stone.addEventListener('click', () => {
      if (s.cachedJobId !== null) return deps.openJob(s.cachedJobId);
      stone.setAttribute('aria-busy', 'true');
      api.runSample(s.name).then(
        ({ id }) => deps.openJob(id),
        (err: unknown) => {
          stone.removeAttribute('aria-busy');
          status.className = 'drop-status error-text';
          status.textContent = err instanceof Error ? err.message : String(err);
        },
      );
    });
    // The hand that comes out of the ground beside this stone: up while the stone is hovered or focused.
    const grasp = h('span', { class: `grasp grasp-${i % 2 === 0 ? 'r' : 'l'}`, 'aria-hidden': 'true' });
    const hand = graspingHand(grasp);
    hands.push(hand);
    stone.addEventListener('mouseenter', hand.rise);
    stone.addEventListener('focus', hand.rise);
    stone.addEventListener('mouseleave', hand.release);
    stone.addEventListener('blur', hand.release);
    stones.append(h('li', {}, stone, grasp));
  }
  restlessHands(stones, hands);

  main.replaceChildren(
    ...[setupNotice(setup)].filter((x): x is HTMLElement => x !== null),
    h(
      'section',
      { class: 'hero', 'aria-labelledby': 'hero-title' },
      h(
        'div',
        {},
        h('p', { class: 'eyebrow' }, 'ActionScript 3 ', h('span', { 'aria-hidden': 'true' }, '→'), h('span', { class: 'sr-only' }, 'to'), ' TypeScript'),
        h('h1', { id: 'hero-title' }, 'Raise Dead Flash ', h('em', {}, 'as Code')),
        h(
          'p',
          { class: 'pitch' },
          'Give it a Flash .swf (ActionScript 3). Get back a readable TypeScript + Vite + PixiJS project, and a fidelity report that measures how closely it matches the original.',
        ),
        actions,
        h('p', { class: 'epitaph-line' }, 'Flash Player reached its end of life on 31 December 2020. Its files did not have to.'),
      ),
      setup.uploadsEnabled ? h('div', {}, zone, input, status) : h('div', {}, uploadsOff(), status),
    ),
    h(
      'section',
      { class: 'yard', id: 'examples', 'aria-labelledby': 'yard-title' },
      h(
        'div',
        { class: 'yard-head' },
        h('h2', { id: 'yard-title' }, 'Or wake one of the resident dead'),
        h('p', {}, 'Samples with documented provenance. Pick a stone to convert it. Glowing stones have risen before and open at once.'),
      ),
      samples.length === 0 ? h('p', { class: 'yard-empty' }, 'The yard is empty: no samples/*/test.swf on this server.') : stones,
    ),
    h(
      'section',
      { class: 'features', id: 'features', 'aria-labelledby': 'features-title' },
      h('div', { class: 'section-head' }, h('h2', { id: 'features-title' }, 'What Rises'), h('p', {}, 'What you get back from every conversion.')),
      h('ul', { class: 'feature-list' }, ...FEATURES.map(([t, d]) => h('li', {}, h('h3', {}, t), h('p', {}, d)))),
    ),
    h(
      'section',
      { class: 'how', id: 'how', 'aria-labelledby': 'how-title' },
      h('div', { class: 'section-head' }, h('h2', { id: 'how-title' }, 'How It Works'), h('p', {}, 'Seven rites, run in order on this server. Raise a file and watch each one happen.')),
      h(
        'ol',
        { class: 'rites-list' },
        ...Object.values(RITES).map((r, i) => h('li', {}, h('span', { class: 'rite-n', 'aria-hidden': 'true' }, String(i + 1)), h('h3', {}, r.rite), h('p', {}, r.what))),
      ),
    ),
  );
}
