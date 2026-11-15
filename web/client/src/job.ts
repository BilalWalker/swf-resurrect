// A job page: the ritual while it runs, then the result (or the failure). Live updates come
// over Server-Sent Events; the server replays the whole history on every (re)connection.
import type { JobSummary, LogLine, ResetEvent } from '../../shared/api';
import { api, ApiFailure, jobUrl } from './api';
import { announce, fill, h } from './dom';
import { RITES } from './labels';
import { Ritual } from './ritual';

export interface JobDeps {
  openJob(id: string): void;
  renderResult(container: HTMLElement, job: JobSummary, deps: { rerun(): void }): void;
}

function notFound(main: HTMLElement, message: string): void {
  main.replaceChildren(
    h(
      'section',
      { class: 'notice is-error', role: 'alert' },
      h('h1', {}, 'No such grave'),
      h('p', {}, message),
      h('a', { class: 'btn', href: '#/' }, 'Back to the graveyard'),
    ),
  );
}

export function renderJob(main: HTMLElement, id: string, deps: JobDeps): () => void {
  let closed = false;
  let es: EventSource | null = null;
  let timer: number | null = null;
  let job: JobSummary | null = null;
  let resultShown = false;

  const title = h('h1', { class: 'job-title' }, '...');
  const meta = h('p', { class: 'job-meta' });
  const queue = h('div', { class: 'queue', role: 'status', hidden: true });
  const ritual = new Ritual();
  const warnings = h('section', { class: 'omens', hidden: true, 'aria-labelledby': 'omens-title' });
  const failure = h('section', { class: 'failure', hidden: true, role: 'alert' });
  const connection = h('p', { class: 'connection', role: 'status', hidden: true });
  const logPre = h('pre', { class: 'log-text', tabindex: '0', 'aria-label': 'Pipeline log' });
  const logCount = h('span', {});
  const log = h('details', { class: 'log' }, h('summary', {}, 'Pipeline log ', logCount), logPre);
  const result = h('div', { class: 'result-slot' });
  const ritualPanel = h(
    'section',
    { class: 'panel ritual-panel', 'aria-labelledby': 'ritual-title' },
    h('div', { class: 'ritual-head' }, h('h2', { id: 'ritual-title' }, 'The ritual'), connection),
    ritual.el,
    warnings,
    log,
  );

  main.replaceChildren(
    h('header', { class: 'job-head' }, h('p', { class: 'eyebrow' }, 'Resurrection'), title, meta),
    queue,
    failure,
    result,
    ritualPanel,
  );

  let logLines = 0;
  const appendLog = (l: LogLine): void => {
    const line = h('span', { class: `log-line is-${l.stream}` }, l.text, '\n');
    const atEnd = logPre.scrollTop + logPre.clientHeight >= logPre.scrollHeight - 8;
    logPre.append(line);
    logLines++;
    logCount.textContent = `(${logLines} line${logLines === 1 ? '' : 's'})`;
    if (atEnd) logPre.scrollTop = logPre.scrollHeight;
  };

  const rerun = (): void => {
    if (job === null) return;
    api.rerun(job.id).then(
      ({ id: next }) => deps.openJob(next),
      (err: unknown) => {
        connection.hidden = false;
        connection.className = 'connection error-text';
        connection.textContent = err instanceof ApiFailure ? err.message : 'The ritual could not be started again.';
      },
    );
  };

  const elapsedText = (j: JobSummary): string => {
    if (j.startedAt === null) return '';
    const end = j.finishedAt === null ? Date.now() : Date.parse(j.finishedAt);
    const s = Math.max(0, Math.round((end - Date.parse(j.startedAt)) / 1000));
    return j.finishedAt === null ? `${s} s elapsed of ${j.timeoutSeconds} s allowed` : `took ${s} s`;
  };

  const renderMeta = (j: JobSummary): void => {
    const source = j.source === 'sample' ? `sample ${j.sample ?? ''}` : 'uploaded file';
    fill(
      meta,
      h('span', {}, source),
      h('span', { class: 'dot', 'aria-hidden': 'true' }, ' · '),
      h('span', { class: 'mono', title: 'SHA-256 of the SWF' }, `sha256 ${j.sha256.slice(0, 12)}`),
      j.startedAt !== null ? h('span', { class: 'dot', 'aria-hidden': 'true' }, ' · ') : null,
      j.startedAt !== null ? h('span', {}, elapsedText(j)) : null,
    );
  };

  const renderFailure = (j: JobSummary): void => {
    if (j.status !== 'failed' || j.error === null) {
      failure.hidden = true;
      return;
    }
    const e = j.error;
    failure.hidden = false;
    failure.className = 'failure panel';
    fill(
      failure,
      h('p', { class: 'eyebrow is-ember' }, 'The ritual failed'),
      h('h2', {}, `It would not rise: ${RITES[e.stage].rite} `, h('code', {}, `(${e.stage})`), ' failed.'),
      e.reportedStage !== null && e.reportedStage !== e.stage
        ? h('p', { class: 'muted' }, 'The pipeline reported the stage as ', h('code', {}, e.reportedStage), '.')
        : null,
      h('pre', { class: 'failure-message' }, e.message),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: rerun }, 'Try the ritual again'),
        h('a', { class: 'btn', href: '#/' }, 'Back to the graveyard'),
      ),
      j.results !== null
        ? h('p', { class: 'muted' }, 'Reports written before the failure are listed below.')
        : null,
    );
    if (j.results !== null && !resultShown) {
      resultShown = true;
      deps.renderResult(result, j, { rerun });
    }
  };

  const renderWarnings = (j: JobSummary): void => {
    if (j.warnings.length === 0 && j.verifyNotes.length === 0) {
      warnings.hidden = true;
      return;
    }
    warnings.hidden = false;
    warnings.replaceChildren(
      h('h3', { id: 'omens-title' }, 'Omens ', h('span', { class: 'muted' }, '(warnings from the pipeline)')),
      h(
        'ul',
        {},
        ...j.warnings.map((w) => h('li', {}, h('code', {}, w.stage), ' ', w.message)),
        ...j.verifyNotes.map((n) => h('li', {}, h('code', {}, 'verify'), ' input note: ', n)),
      ),
    );
  };

  const render = (j: JobSummary): void => {
    const was = job?.status;
    job = j;
    title.textContent = j.name;
    document.title = `${j.name} | SWF Resurrect`;
    renderMeta(j);
    ritual.update(j);
    renderWarnings(j);
    renderFailure(j);
    if (j.status === 'queued') {
      queue.hidden = false;
      queue.className = 'queue notice';
      queue.textContent =
        j.queuePosition === null
          ? 'Waiting in the crypt.'
          : `Waiting in the crypt: position ${j.queuePosition} in the queue. One ritual runs at a time.`;
    } else queue.hidden = true;

    // Settled once the server has finished the job (a failure line can arrive before the process ends).
    const final = (j.status === 'succeeded' || j.status === 'failed') && j.finishedAt !== null;
    if (final) {
      es?.close();
      es = null;
      connection.hidden = true;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      ritualPanel.classList.add('is-done');
    }
    if (j.status === 'succeeded' && !resultShown) {
      resultShown = true;
      deps.renderResult(result, j, { rerun });
      if (was !== undefined && was !== 'succeeded') announce(`It lives. ${j.name} was converted.`);
    }
    if (j.status === 'failed' && was !== undefined && was !== 'failed' && j.error !== null) {
      announce(`The ritual failed at ${RITES[j.error.stage].rite} (${j.error.stage}): ${j.error.message}`);
    }
  };

  const connect = (): void => {
    if (closed) return;
    es = new EventSource(jobUrl.events(id));
    es.addEventListener('reset', (ev) => {
      const r = JSON.parse((ev as MessageEvent<string>).data) as ResetEvent;
      logPre.replaceChildren();
      logLines = 0;
      for (const l of r.log) appendLog(l);
      connection.hidden = true;
      render(r.job);
    });
    es.addEventListener('job', (ev) => render(JSON.parse((ev as MessageEvent<string>).data) as JobSummary));
    es.addEventListener('log', (ev) => appendLog(JSON.parse((ev as MessageEvent<string>).data) as LogLine));
    es.addEventListener('error', () => {
      if (closed || job === null || job.finishedAt !== null) return;
      connection.hidden = false;
      connection.className = 'connection';
      connection.textContent = 'The connection dropped; reconnecting...';
    });
  };

  // Check the job exists first: EventSource cannot tell a 404 from a network error.
  api.job(id).then(
    (j) => {
      if (closed) return;
      render(j);
      if (j.finishedAt === null) {
        connect();
        timer = window.setInterval(() => {
          if (job !== null) renderMeta(job);
        }, 1000);
      } else {
        // Finished: the log still comes from the event stream's history.
        connect();
      }
    },
    (err: unknown) => {
      if (closed) return;
      if (err instanceof ApiFailure && err.status === 404) notFound(main, 'This job does not exist on this server, or its files were removed.');
      else notFound(main, err instanceof Error ? err.message : String(err));
    },
  );

  return () => {
    closed = true;
    es?.close();
    if (timer !== null) window.clearInterval(timer);
  };
}
