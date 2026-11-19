// Client entry: draws the sky, routes between the graveyard (#/) and a job (#/job/<id>).
import { CRESCENT, HORIZON } from './art';
import { svg } from './dom';
import { renderJob } from './job';
import { renderLanding } from './landing';
import { renderResult } from './result';
import { raiseTheDead } from './undead';

const main = document.getElementById('main') as HTMLElement;
let cleanup: (() => void) | null = null;

function decorate(): void {
  const sky = document.getElementById('sky');
  if (sky !== null) {
    // Small lights placed on the painted backdrop: `.scene` has the backdrop's box, so percentages are picture coordinates.
    const scene = document.createElement('div');
    scene.className = 'scene';
    for (const c of ['moon-glow', 'chapel-light', 'wisp wisp-1', 'wisp wisp-2', 'wisp wisp-3', 'lightning']) {
      const el = document.createElement('span');
      el.className = c;
      scene.append(el);
    }
    // Candle light flickering in the painted jack-o'-lanterns and the lantern: [class, x %, y %, width %],
    // measured on the backdrop. Each gets its own pace so they never pulse together.
    const flames: Array<[string, number, number, number]> = [
      ['pumpkin-glow', 7.3, 46.2, 4], ['pumpkin-glow', 7.6, 52.1, 5.5], ['pumpkin-glow', 7.8, 59.5, 7],
      ['pumpkin-glow', 92.7, 46.2, 4], ['pumpkin-glow', 92.7, 52.1, 5.5], ['pumpkin-glow', 92.7, 59.5, 7],
      ['pumpkin-glow', 26.1, 30.5, 2.6], ['pumpkin-glow', 32.1, 33.5, 2.6], ['pumpkin-glow', 40.5, 36.2, 2.6],
      ['pumpkin-glow', 78.2, 37.8, 2.6], ['pumpkin-glow', 86.9, 33.7, 2.6],
      ['lantern-glow', 91.0, 25.7, 2.4],
    ];
    for (const [c, x, y, w] of flames) {
      const el = document.createElement('span');
      el.className = c;
      el.style.cssText = `left:${x}%;top:${y}%;width:${w}%;animation-duration:${(2.6 + Math.random() * 2.4).toFixed(2)}s;animation-delay:-${(Math.random() * 4).toFixed(2)}s`;
      scene.append(el);
    }
    sky.prepend(scene);
    raiseTheDead(scene);
    sky.append(svg(HORIZON));
    // Bats crossing the sky: a painted sprite (art/bat-sheet.webp) flapped and flown by CSS.
    // and now and then a ghost drifting through (art/ghost.webp), flown by CSS
    const ghost = document.createElement('span');
    ghost.className = 'ghost';
    ghost.setAttribute('aria-hidden', 'true');
    sky.append(ghost);
    for (const c of ['bat', 'bat bat-2', 'bat bat-3']) {
      const bat = document.createElement('span');
      bat.className = c;
      bat.setAttribute('aria-hidden', 'true');
      sky.append(bat);
    }
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
    cleanup = renderJob(main, m[1], { openJob, renderResult });
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
