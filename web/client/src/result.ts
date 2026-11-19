// The result: "It lives." Scores as moon gauges (the number always printed), the original (in
// Ruffle) beside the converted project, then the autopsy (fidelity report),
// what stayed in the grave (unsupported features and classes) and the grimoire (source).
import type { JobOutcome, JobSummary, ResultSummary, ScoreSummary } from '../../shared/api';
import { jobUrl } from './api';
import { EKG, moonGauge } from './art';
import { h, pct, svg } from './dom';
import { renderGrimoire } from './grimoire';
import { reasonText } from './labels';
import { resultHeadline, stageAspect } from './outcomeText';
import { gapPanel } from './outcomeView';
import { playerPair } from './players';

function gauge(title: string, measures: string, score: ScoreSummary | null, missing: string): HTMLElement {
  const value = score?.value ?? null;
  const reasons = score === null ? [] : score.reasons;
  const text = value === null ? 'not compared' : pct(value);
  return h(
    'figure',
    { class: `gauge${value === null ? ' is-none' : ''}`, 'aria-label': `${title}: ${text}` },
    svg(moonGauge(value === null ? null : value / 100)),
    h(
      'figcaption',
      {},
      h('span', { class: 'gauge-title' }, title),
      h('span', { class: 'gauge-value' }, text),
      h('span', { class: 'gauge-measures' }, measures),
      value !== null && score?.basis ? h('span', { class: 'gauge-basis' }, score.basis) : null,
      value === null && score === null ? h('span', { class: 'gauge-basis' }, missing) : null,
      ...(value === null
        ? reasons.map((r) => h('span', { class: 'gauge-basis' }, reasonText(r), ' ', h('code', {}, r)))
        : []),
    ),
  );
}

/**
 * One class count per page: with the engine's numbers the tile shows "translated of candidates", the
 * same figure as the gap panel. Without them (numbers: null, or a job from before the Outcome_File)
 * it falls back to the translation report's total.
 */
function classesTile(r: ResultSummary, o: JobOutcome | null): HTMLElement {
  const n = o?.numbers ?? null;
  const plural = (k: number, w: string): string => `${k} ${w}${k === 1 ? '' : 's'}`;
  if (n !== null) {
    return h(
      'div',
      { class: 'tile' },
      h('span', { class: 'tile-title' }, 'Classes translated'),
      h('span', { class: 'tile-value' }, `${n.translatedClasses} of ${n.candidateClasses}`),
      h(
        'span',
        { class: 'tile-sub' },
        `${n.cleanClasses} clean · ${n.looseClasses} loose · ${n.unsupportedClasses} unsupported · ${n.omittedClasses} omitted`,
        h('br'),
        plural(n.typeErrors, 'type error'),
      ),
    );
  }
  const c = r.classCounts;
  return h(
    'div',
    { class: 'tile' },
    h('span', { class: 'tile-title' }, 'Classes translated'),
    h('span', { class: 'tile-value' }, c === null ? 'none reported' : String(c.total)),
    c === null
      ? h('span', { class: 'tile-sub' }, 'No translation report was written.')
      : h(
          'span',
          { class: 'tile-sub' },
          `${c.clean} clean · ${c.loose} loose · ${c.unsupported} unsupported · ${c.omitted} omitted`,
          h('br'),
          `${plural(c.typeErrors, 'type error')}${c.overridden > 0 ? ` · ${plural(c.overridden, 'handwritten override')}` : ''}`,
        ),
  );
}

function graveTile(r: ResultSummary, show: () => void): HTMLElement {
  const n = r.unsupported?.length ?? null;
  return h(
    'div',
    { class: 'tile' },
    h('span', { class: 'tile-title' }, 'Stayed in the grave'),
    h('span', { class: 'tile-value' }, n === null ? 'not listed' : String(n)),
    h(
      'span',
      { class: 'tile-sub' },
      n === null ? 'No unsupported-features list was written.' : `unsupported feature${n === 1 ? '' : 's'} listed. `,
      n !== null ? h('button', { type: 'button', class: 'linkish', onclick: show }, 'See the list') : null,
    ),
  );
}

function autopsy(job: JobSummary): HTMLElement {
  if (!job.artifacts.report) {
    return h('p', { class: 'muted' }, 'No autopsy was performed: the verify stage wrote no fidelity report for this run.');
  }
  return h(
    'div',
    {},
    h(
      'p',
      { class: 'muted' },
      'The coroner’s report, written by the verify stage: frame-by-frame image comparison with difference images, and the behaviour trace comparison. ',
      h('a', { href: jobUrl.report(job.id), target: '_blank', rel: 'noopener noreferrer' }, 'Open it in a new tab'),
      '.',
    ),
    h('iframe', { class: 'report-frame', src: jobUrl.report(job.id), title: 'Fidelity report', sandbox: '', referrerpolicy: 'no-referrer' }),
  );
}

function grave(r: ResultSummary): HTMLElement {
  const list = r.unsupported;
  const unsupported =
    list === null
      ? h('p', { class: 'muted' }, 'No unsupported-features list was written for this run.')
      : list.length === 0
        ? h('p', {}, 'Nothing stayed in the grave: the pipeline listed no unsupported features.')
        : h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              {},
              h('caption', { class: 'sr-only' }, 'Unsupported features'),
              h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Kind'), h('th', { scope: 'col' }, 'Where'), h('th', { scope: 'col' }, 'What the pipeline says'))),
              h(
                'tbody',
                {},
                ...list.map((u) =>
                  h(
                    'tr',
                    {},
                    h('td', {}, h('code', {}, u.kind)),
                    h('td', { class: 'mono' }, [u.id !== null ? `id ${u.id}` : null, u.tag].filter((x) => x !== null).join(' · ') || '—'),
                    h('td', {}, u.message),
                  ),
                ),
              ),
            ),
          );
  const classes =
    r.classes.length === 0
      ? h('p', { class: 'muted' }, 'No classes were reported.')
      : h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            {},
            h('caption', { class: 'sr-only' }, 'Translated classes'),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col' }, 'Class'),
                h('th', { scope: 'col' }, 'Status'),
                h('th', { scope: 'col' }, 'File'),
                h('th', { scope: 'col', class: 'num' }, 'Diagnostics'),
                h('th', { scope: 'col', class: 'num' }, 'Type errors'),
              ),
            ),
            h(
              'tbody',
              {},
              ...r.classes.map((c) =>
                h(
                  'tr',
                  {},
                  h('td', { class: 'mono' }, c.className),
                  h(
                    'td',
                    {},
                    h('span', { class: `status is-${c.status}` }, c.status),
                    c.omitted ? h('span', { class: 'status is-omitted' }, 'omitted') : null,
                    c.overridden ? h('span', { class: 'status' }, 'handwritten') : null,
                  ),
                  h('td', { class: 'mono' }, c.path ?? '—'),
                  h('td', { class: 'num mono' }, String(c.diagnostics)),
                  h('td', { class: 'num mono' }, String(c.typeErrors)),
                ),
              ),
            ),
          ),
        );
  return h(
    'div',
    {},
    h('h4', {}, 'Unsupported features'),
    unsupported,
    h('h4', {}, 'Classes'),
    h(
      'p',
      { class: 'muted small' },
      'clean: translated without loose typing · loose: translated with some dynamic (any) typing · unsupported: uses something the translator cannot express · omitted: left out of the class registry.',
    ),
    classes,
  );
}

interface TabDef {
  id: string;
  label: string;
  render(panel: HTMLElement): void;
}

function tabs(defs: TabDef[], prefix: string): { el: HTMLElement; select(id: string): void } {
  const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Result details' });
  const panels = h('div', { class: 'tab-panels' });
  const rendered = new Set<string>();
  const buttons: HTMLButtonElement[] = [];
  const panelEls: HTMLElement[] = [];
  const select = (id: string, focus = false): void => {
    defs.forEach((d, i) => {
      const on = d.id === id;
      buttons[i].setAttribute('aria-selected', String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      panelEls[i].hidden = !on;
      if (on && !rendered.has(d.id)) {
        rendered.add(d.id);
        d.render(panelEls[i]);
      }
      if (on && focus) buttons[i].focus();
    });
  };
  defs.forEach((d, i) => {
    const b = h('button', { type: 'button', role: 'tab', id: `${prefix}-tab-${d.id}`, 'aria-controls': `${prefix}-panel-${d.id}` }, d.label);
    b.addEventListener('click', () => select(d.id));
    b.addEventListener('keydown', (e) => {
      const k = e.key;
      let j = -1;
      if (k === 'ArrowRight') j = (i + 1) % defs.length;
      else if (k === 'ArrowLeft') j = (i - 1 + defs.length) % defs.length;
      else if (k === 'Home') j = 0;
      else if (k === 'End') j = defs.length - 1;
      if (j >= 0) {
        e.preventDefault();
        select(defs[j].id, true);
      }
    });
    buttons.push(b);
    list.append(b);
    const p = h('div', { class: 'tab-panel', role: 'tabpanel', id: `${prefix}-panel-${d.id}`, 'aria-labelledby': `${prefix}-tab-${d.id}`, tabindex: '0' });
    panelEls.push(p);
    panels.append(p);
  });
  select(defs[0].id);
  return { el: h('div', { class: 'details' }, list, panels), select: (id) => select(id, true) };
}

export function renderResult(container: HTMLElement, job: JobSummary, deps: { rerun(): void }): void {
  const r: ResultSummary = job.results ?? { stage: null, overallMatch: null, traceScore: null, classCounts: null, classes: [], unsupported: null };
  const alive = job.status === 'succeeded';
  const defs: TabDef[] = [];
  if (alive || job.artifacts.report) defs.push({ id: 'autopsy', label: 'Autopsy (fidelity report)', render: (p) => p.replaceChildren(autopsy(job)) });
  defs.push({ id: 'grave', label: 'What stayed in the grave', render: (p) => p.replaceChildren(grave(r)) });
  if (alive && job.artifacts.sourceFiles > 0) defs.push({ id: 'grimoire', label: 'Grimoire (source)', render: (p) => renderGrimoire(p, job.id, r.classes) });
  const t = tabs(defs, `r-${job.id.slice(0, 6)}`);

  if (!alive) {
    container.replaceChildren(
      h('section', { class: 'panel result is-remains', 'aria-labelledby': 'remains-title' }, h('h2', { id: 'remains-title' }, 'Remains recovered before the failure'), t.el),
    );
    return;
  }

  const gaps = gapPanel(job);
  const head = resultHeadline(job.name, job.outcome);
  container.replaceChildren(
    h(
      'section',
      { class: 'result', 'aria-labelledby': 'alive-title' },
      h(
        'header',
        { class: 'alive' },
        h(
          'div',
          { class: 'alive-text' },
          h('h2', { id: 'alive-title', class: `alive-title is-${head.tone}`, tabindex: '-1' }, head.title),
          h('p', { class: 'alive-sub' }, head.sub),
        ),
        svg(EKG),
        h(
          'div',
          { class: 'actions result-actions' },
          job.artifacts.project
            ? h('a', { class: 'btn btn-primary', href: jobUrl.zip(job.id), download: '' }, 'Take the body home (.zip)')
            : null,
          h('button', { type: 'button', class: 'btn', onclick: deps.rerun }, 'Re-run'),
          h('a', { class: 'btn', href: '#/' }, 'Raise another'),
        ),
      ),
      gaps,
      h(
        'div',
        { class: 'vitals', role: 'group', 'aria-label': 'Soul match and counts' },
        gauge('Overall match', 'Mean pixel match over sampled frames', r.overallMatch, 'No fidelity report was written.'),
        gauge('Trace score', 'Trace lines matched in a replay', r.traceScore, 'No fidelity report was written.'),
        classesTile(r, job.outcome),
        graveTile(r, () => t.select('grave')),
      ),
      playerPair(job, stageAspect(r.stage, job.outcome)),
      t.el,
    ),
  );
}
