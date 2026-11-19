// The parts of the result page that depend on the engine's Outcome: the gap panel of a
// converted-with-gaps run, and the refused and failed states.
import type { JobSummary } from '../../shared/api';
import { h } from './dom';
import { classLine, fewTranslated, gapLines, refusalHint } from './outcomeText';

/**
 * The gaps of a converted-with-gaps run, in plain words. Null for any other outcome. Says plainly
 * when so few classes were translated that the project will probably not run.
 */
export function gapPanel(job: JobSummary): HTMLElement | null {
  const o = job.outcome;
  if (o === null || o.outcome !== 'converted-with-gaps') return null;
  const n = o.numbers;
  const classes = classLine(n);
  const lines = gapLines(o.gaps);
  const few = fewTranslated(n);
  return h(
    'section',
    { class: `gap-panel${few ? ' is-few' : ''}`, 'aria-labelledby': 'gaps-title' },
    h('h3', { id: 'gaps-title' }, 'Converted with gaps'),
    few
      ? h('p', { class: 'gap-warning' }, 'Few of its classes were translated, so the converted project will probably not run as the original did.')
      : h('p', { class: 'muted' }, 'A project was written, but parts of the original are missing or need fixing by hand.'),
    h(
      'ul',
      { class: 'gap-list' },
      classes !== null ? h('li', { class: 'gap-classes' }, classes) : null,
      n !== null && n.typeErrors > 0 && !o.gaps.some((g) => g.kind === 'type-error')
        ? h('li', {}, `${n.typeErrors} type error${n.typeErrors === 1 ? '' : 's'} in the TypeScript`)
        : null,
      ...lines.map((l) => h('li', { 'data-kind': l.kind }, l.text)),
      o.obfuscation?.recovered === true ? h('li', { class: 'gap-obfuscated' }, 'obfuscated: names renamed') : null,
    ),
  );
}

/** A refused run: the engine's sentence large, one line of what to try, no download and no player. */
export function refusedView(job: JobSummary, deps: { rerun(): void }): HTMLElement {
  const o = job.outcome;
  const hint = refusalHint(o?.reasonCode ?? null, null);
  return h(
    'section',
    { class: 'panel outcome is-refused', 'aria-labelledby': 'outcome-title' },
    h('p', { class: 'eyebrow is-ember' }, 'Not converted'),
    h('h2', { id: 'outcome-title', class: 'outcome-reason', tabindex: '-1' }, o?.reason ?? 'The file was refused.'),
    hint !== '' ? h('p', { class: 'outcome-hint' }, hint) : null,
    h(
      'div',
      { class: 'actions' },
      o?.reasonCode === 'time-limit' ? h('button', { class: 'btn', type: 'button', onclick: deps.rerun }, 'Try again') : null,
      h('a', { class: 'btn btn-primary', href: '#/' }, 'Choose another file'),
    ),
  );
}

/** A failed run: our fault, said so, with the reference id and never a stack trace. */
export function failedView(job: JobSummary, deps: { rerun(): void }): HTMLElement {
  const ref = job.outcome?.referenceId ?? null;
  // The engine's sentence (already scrubbed) or one the server wrote itself; raw CLI lines stay in the log.
  const sentence = job.outcome?.reason ?? (job.error !== null && job.error.reportedStage === null ? job.error.message : null);
  return h(
    'section',
    { class: 'panel outcome is-failed', 'aria-labelledby': 'outcome-title' },
    h('p', { class: 'eyebrow is-ember' }, 'Failed'),
    h('h2', { id: 'outcome-title', tabindex: '-1' }, 'Something went wrong on our side'),
    h('p', {}, 'The file may be fine; the converter broke while working on it.'),
    sentence !== null ? h('p', { class: 'muted outcome-sentence' }, sentence) : null,
    ref !== null
      ? h('p', { class: 'outcome-ref' }, 'Reference ', h('code', {}, ref), '. Quote it when you report the problem.')
      : null,
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: deps.rerun }, 'Try again'),
      h('a', { class: 'btn', href: '#/' }, 'Back to the graveyard'),
    ),
  );
}
