// The resurrection ritual: one row per pipeline stage, with its line icon, marked in order as the
// CLI reports each stage. The ritual name is decoration; the real stage name, status and the CLI's own numbers
// are always shown next to it.
import type { JobSummary, StageKey, StageState } from '../../shared/api';
import { announce, h } from './dom';
import { RITES, STAGE_ICONS, STATUS_TEXT } from './labels';

interface RiteNodes {
  li: HTMLLIElement;
  status: HTMLElement;
  detail: HTMLElement;
  last: StageState | null;
}

export class Ritual {
  readonly el: HTMLElement;
  private readonly list: HTMLOListElement;
  /** One moon per stage, lit as each stage completes: the mockup's moon-phase row. */
  readonly moons: HTMLElement;
  private readonly nodes = new Map<StageKey, RiteNodes>();
  private first = true;

  constructor() {
    this.list = h('ol', { class: 'rites' });
    this.moons = h('span', { class: 'moon-row', 'aria-hidden': 'true' });
    this.el = h('div', { class: 'ritual' }, this.list);
  }

  update(job: JobSummary): void {
    job.stages.forEach((s, i) => {
      let n = this.nodes.get(s.key);
      if (n === undefined) {
        n = this.make(s.key, i);
        this.nodes.set(s.key, n);
      }
      this.apply(n, s);
    });
    this.el.dataset.status = job.status;
    if (this.moons.childElementCount !== job.stages.length) {
      this.moons.replaceChildren(...job.stages.map((_, i) => h('i', { style: `--i:${i}` })));
    }
    job.stages.forEach((s, i) => {
      const moon = this.moons.children[i];
      if (moon instanceof HTMLElement) moon.dataset.status = s.status;
    });
    this.first = false;
  }

  private make(key: StageKey, index: number): RiteNodes {
    const status = h('span', { class: 'rite-status' });
    const detail = h('p', { class: 'rite-detail' });
    const li = h(
      'li',
      { class: 'rite', 'data-status': 'pending', style: `--i:${index}` },
      h('img', {
        class: 'rite-icon',
        src: `/art/icon-${STAGE_ICONS[key]}.webp`,
        alt: '',
        width: '32',
        height: '32',
        decoding: 'async',
        'aria-hidden': 'true',
      }),
      h(
        'div',
        { class: 'rite-body' },
        h('h3', { class: 'rite-title' }, h('span', { class: 'rite-name' }, RITES[key].rite), ' ', h('code', { class: 'rite-stage' }, key)),
        h('p', { class: 'rite-what' }, RITES[key].what),
        detail,
      ),
      status,
    );
    this.list.append(li);
    return { li, status, detail, last: null };
  }

  private apply(n: RiteNodes, s: StageState): void {
    const prev = n.last;
    n.last = s;
    n.li.dataset.status = s.status;
    n.status.textContent = STATUS_TEXT[s.status];
    n.detail.textContent = s.detail ?? '';
    n.detail.hidden = s.detail === null;
    if (s.status === 'running') n.li.setAttribute('aria-current', 'step');
    else n.li.removeAttribute('aria-current');
    // Announce real changes only (not the replayed history on first paint).
    if (!this.first && prev !== null && prev.status !== s.status && s.status !== 'pending' && s.status !== 'skipped') {
      const label = `${RITES[s.key].rite} (${s.key}): ${STATUS_TEXT[s.status]}`;
      announce(s.detail !== null && s.status !== 'running' ? `${label}. ${s.detail}` : label);
    }
  }
}
