// Landing view: what the tool does, the open grave (file drop) and the tombstones (samples).
import type { SampleInfo, SetupStatus } from '../../shared/api';
import { api, ApiFailure } from './api';
import { GRAVE } from './art';
import { formatBytes, h, svg } from './dom';

export interface LandingDeps {
  openJob(id: string): void;
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
    svg(GRAVE),
    h('p', { class: 'drop-title' }, 'Lay a .swf to rest here', h('br'), h('span', {}, '...and raise it')),
    h(
      'p',
      { class: 'drop-hint', id: 'drop-hint' },
      `Drop a file, or press Enter to choose one. ActionScript 3 only, up to ${maxMb} MB.`,
    ),
  );

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

  const stones = h('ul', { class: 'stones' });
  for (const s of samples) {
    const stone = h(
      'button',
      { type: 'button', class: 'stone', 'aria-label': `Convert sample ${s.name}, ${formatBytes(s.bytes)}${s.cachedJobId !== null ? ', result ready' : ''}` },
      h('span', { class: 'here-lies', 'aria-hidden': 'true' }, 'HERE LIES'),
      h('span', { class: 'stone-name' }, s.name),
      h('span', { class: 'stone-meta' }, `AS3 · ${formatBytes(s.bytes)}`),
      s.author !== null || s.licence !== null
        ? h('span', { class: 'stone-credit' }, [s.author, s.licence].filter((x) => x !== null).join(' · '))
        : null,
      s.cachedJobId !== null ? h('span', { class: 'stone-risen' }, 'Risen before: opens at once') : null,
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
    stones.append(h('li', {}, stone));
  }

  main.replaceChildren(
    ...[setupNotice(setup)].filter((x): x is HTMLElement => x !== null),
    h(
      'section',
      { class: 'hero', 'aria-labelledby': 'hero-title' },
      h(
        'div',
        {},
        h('p', { class: 'eyebrow' }, 'ActionScript 3 to TypeScript'),
        h('h1', { id: 'hero-title' }, 'Raise dead Flash ', h('em', {}, 'as code'), '.'),
        h(
          'p',
          { class: 'pitch' },
          'Give it a Flash .swf (ActionScript 3). Get back a readable TypeScript + Vite + PixiJS project, and a fidelity report that measures how closely it matches the original.',
        ),
        h('p', { class: 'epitaph-line' }, 'Flash Player reached its end of life on 31 December 2020. Its files did not have to.'),
      ),
      h('div', {}, zone, input, status),
    ),
    h(
      'section',
      { class: 'yard', 'aria-labelledby': 'yard-title' },
      h(
        'div',
        { class: 'yard-head' },
        h('h2', { id: 'yard-title' }, 'Or wake one of the resident dead'),
        h('p', {}, 'Samples with documented provenance. Pick a stone to convert it.'),
      ),
      samples.length === 0 ? h('p', { class: 'yard-empty' }, 'The yard is empty: no samples/*/test.swf on this server.') : stones,
    ),
  );
}
