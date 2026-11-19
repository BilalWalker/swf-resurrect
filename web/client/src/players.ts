// The two players of a job page. The original SWF runs in Ruffle; the converted project runs as
// built by this server. Their labels must never be confusable: the Ruffle panel is not our output.
import type { JobSummary } from '../../shared/api';
import { jobUrl } from './api';
import { h } from './dom';

export const ORIGINAL_LABEL = 'Original (Flash, played by Ruffle)';
export const CONVERTED_LABEL = 'Converted (TypeScript + PixiJS)';

function frame(src: string, title: string): HTMLIFrameElement {
  return h('iframe', { src, title, sandbox: 'allow-scripts', referrerpolicy: 'no-referrer', loading: 'lazy' });
}

interface Player {
  figure: HTMLElement;
  restart(): void;
}

/** The uploaded file as it was, emulated by Ruffle. */
export function originalPlayer(job: JobSummary, aspect: string): Player {
  const make = (): HTMLIFrameElement => frame(jobUrl.ruffle(job.id), `${ORIGINAL_LABEL}: ${job.name}`);
  const box = h('div', { class: 'screen', style: `aspect-ratio: ${aspect}` }, make());
  const figure = h(
    'figure',
    { class: 'side is-original' },
    h(
      'figcaption',
      {},
      h('span', { class: 'side-badge' }, 'Original'),
      h('span', { class: 'side-name' }, ORIGINAL_LABEL),
      h('span', { class: 'side-sub' }, 'the uploaded file as it was, not the conversion'),
    ),
    box,
  );
  return { figure, restart: () => box.replaceChildren(make()) };
}

/** The converted project, built for the preview. Focused when it loads, so keyboard games get the keys. */
export function convertedPlayer(job: JobSummary, aspect: string, buildDetail: string | null): Player {
  const make = (): HTMLIFrameElement => {
    const f = frame(jobUrl.app(job.id), `${CONVERTED_LABEL}: ${job.name}`);
    f.addEventListener('load', () => f.focus({ preventScroll: true }));
    return f;
  };
  const box = h(
    'div',
    { class: 'screen', style: `aspect-ratio: ${aspect}` },
    job.artifacts.app
      ? make()
      : h(
          'p',
          { class: 'screen-empty' },
          'The converted project could not be built for the preview',
          buildDetail ? `: ${buildDetail}` : '.',
          ' The project zip is still complete.',
        ),
  );
  const figure = h(
    'figure',
    { class: 'side is-converted' },
    h(
      'figcaption',
      {},
      h('span', { class: 'side-badge' }, 'Converted'),
      h('span', { class: 'side-name' }, CONVERTED_LABEL),
      h('span', { class: 'side-sub' }, 'what this tool made of it'),
    ),
    box,
  );
  return { figure, restart: () => (job.artifacts.app ? box.replaceChildren(make()) : undefined) };
}

const SANDBOX_NOTE = 'Runs sandboxed: no access to this page, your cookies or other sites. Browsers keep sound off until you click a frame.';

/** Both players side by side, for a run that produced a project. */
export function playerPair(job: JobSummary, aspect: string): HTMLElement {
  const build = job.stages.find((s) => s.key === 'build');
  const original = originalPlayer(job, aspect);
  const converted = convertedPlayer(job, aspect, build?.detail ?? null);
  return h(
    'section',
    { class: 'seance', 'aria-labelledby': 'seance-title' },
    h(
      'div',
      { class: 'seance-head' },
      h('h3', { id: 'seance-title' }, 'Original and converted, side by side'),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => (original.restart(), converted.restart()) }, 'Restart both'),
        job.artifacts.app
          ? h('a', { class: 'btn btn-small', href: jobUrl.app(job.id), target: '_blank', rel: 'noopener noreferrer' }, 'Open the converted game in a new tab')
          : null,
      ),
    ),
    h('div', { class: 'pair' }, original.figure, converted.figure),
    h('p', { class: 'muted small' }, SANDBOX_NOTE),
  );
}

/** Only the original, for a refused or failed run: there is no converted project to show. */
export function originalOnly(job: JobSummary, aspect: string): HTMLElement {
  const original = originalPlayer(job, aspect);
  return h(
    'section',
    { class: 'seance is-single', 'aria-label': ORIGINAL_LABEL },
    h('div', { class: 'single' }, original.figure),
    h('p', { class: 'muted small' }, 'No converted version exists for this file. ', SANDBOX_NOTE),
  );
}
