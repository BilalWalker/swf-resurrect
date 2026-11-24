// Painted props around the result page (brief 3 mockup): skull candles, potion, pumpkins, lantern,
// candles, pentagram, cobweb. Decoration only: empty alt, aria-hidden, lazy, explicit sizes, never
// over text or controls (CSS places them in reserved corners or in the page margins and hides them
// below 900 px; the margin props need 1400 px). test/web/decor.chromium.test.ts checks the overlap.
import { h } from './dom';

type PropName = 'skull-candles' | 'potion' | 'pumpkin' | 'pumpkin-candles' | 'lantern' | 'candles' | 'pentagram' | 'cobweb';

/** Natural size of each shipped file (web/scripts/build-art.py), so the box is known before it loads. */
const SIZES: Record<PropName, [number, number]> = {
  'skull-candles': [280, 320],
  potion: [288, 320],
  pumpkin: [320, 278],
  'pumpkin-candles': [320, 252],
  lantern: [161, 320],
  candles: [276, 320],
  pentagram: [253, 256],
  cobweb: [256, 224],
};

function prop(name: PropName, place: string): HTMLImageElement {
  const [width, height] = SIZES[name];
  const src = name === 'pentagram' || name === 'cobweb' ? `/art/orn-${name}.webp` : `/art/prop-${name}.webp`;
  return h('img', {
    class: `prop prop-${name} ${place}`,
    src,
    alt: '',
    width: String(width),
    height: String(height),
    loading: 'lazy',
    decoding: 'async',
    'aria-hidden': 'true',
  });
}

/** Adds the props of one part of the page, once. */
export function decorate(el: HTMLElement, part: 'vitals' | 'report' | 'ritual'): void {
  if (el.querySelector(':scope > .prop') !== null) return;
  if (part === 'vitals') el.append(prop('candles', 'is-gutter is-left'), prop('lantern', 'is-gutter is-right'));
  if (part === 'report') {
    el.append(prop('potion', 'is-gutter is-left'), prop('skull-candles', 'is-gutter is-right'), prop('cobweb', 'is-inside'));
  }
  if (part === 'ritual') {
    el.append(prop('pumpkin', 'is-gutter is-left'), prop('pumpkin-candles', 'is-gutter is-right'), prop('pentagram', 'is-inside'));
  }
}

/**
 * The side pillars (index.html, CSS from 1500 px) start where the page's main proof starts: the
 * report and tab block of a result ("Autopsy"); the ritual panel on a refused or failed run; the
 * "What Rises" section on the landing (the gallery above it is a full-width dark band that would
 * hide them). Their top follows that element as the page changes; with none of them on
 * the page the pillars stay hidden. Call once.
 */
export function watchPillars(): void {
  const pillars = document.querySelector<HTMLElement>('.pillars');
  if (pillars === null) return;
  let queued = false;
  const place = (): void => {
    queued = false;
    const anchor = document.querySelector<HTMLElement>('.details, .ritual-panel, #features');
    if (anchor === null) {
      pillars.removeAttribute('data-placed');
      return;
    }
    const top = Math.round(anchor.getBoundingClientRect().top + window.scrollY);
    pillars.style.setProperty('--pillar-top', `${top}px`);
    pillars.setAttribute('data-placed', '');
  };
  const queue = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(place);
  };
  new ResizeObserver(queue).observe(document.body);
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', queue);
  queue();
}
