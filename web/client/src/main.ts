// Client entry: draws the sky, routes between the graveyard (#/) and a job (#/job/<id>).
import { BAT, CRESCENT, HORIZON } from './art';
import { h, svg } from './dom';
import { renderLanding } from './landing';

const main = document.getElementById('main') as HTMLElement;
let cleanup: (() => void) | null = null;

function decorate(): void {
  const sky = document.getElementById('sky');
  if (sky !== null) {
    sky.append(svg(HORIZON), svg(BAT));
    const bat2 = svg(BAT);
    bat2.classList.add('bat-2');
    sky.append(bat2);
  }
  document.getElementById('wordmark')?.prepend(svg(CRESCENT));

  // A file dragged anywhere over the page stirs the fog; a drop outside the grave does nothing.
  let depth = 0;
  window.addEventListener('dragenter', () => {
    depth++;
    document.body.classList.add('is-dragging');
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) document.body.classList.remove('is-dragging');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('is-dragging');
  });
}

export function openJob(id: string): void {
  window.location.hash = `#/job/${id}`;
}

function route(): void {
  cleanup?.();
  cleanup = null;
  const hash = window.location.hash;
  const m = hash.match(/^#\/job\/([a-f0-9]{24})$/);
  if (m) {
    document.title = 'Ritual | SWF Resurrect';
    main.replaceChildren(
      h('p', { class: 'loading' }, 'Job ', h('code', {}, m[1]), ' started. ', h('a', { href: `/api/jobs/${m[1]}` }, 'Job summary (JSON)')),
    );
  } else {
    document.title = 'SWF Resurrect';
    void renderLanding(main, { openJob });
  }
}

decorate();
window.addEventListener('hashchange', () => {
  route();
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
route();
