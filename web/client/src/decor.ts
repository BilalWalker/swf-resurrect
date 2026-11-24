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
