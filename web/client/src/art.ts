// Original illustrations, drawn here as inline SVG (no third-party art). Colours come from CSS
// custom properties so one palette rules the whole page. All of it is decorative (aria-hidden)
// unless a caller gives it a label.

/** The night horizon behind the landing page: hills, a dead tree, a fence and old stones. */
export const HORIZON = `
<svg class="horizon" viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <path class="hill-far" d="M0 150 C 180 110 300 128 470 118 C 640 108 760 70 930 92 C 1110 114 1250 96 1440 120 L1440 240 L0 240 Z"/>
  <g class="tree">
    <path d="M196 196 C 198 160 194 140 186 118 C 180 102 170 92 158 84 M186 118 C 196 104 212 98 226 86 C 232 80 236 70 238 62
             M190 140 C 176 132 160 130 144 132 M192 130 C 206 126 222 128 236 122 M158 84 C 150 78 146 70 146 60
             M226 86 C 240 84 250 78 258 70 M170 96 C 166 88 168 80 172 72"
          fill="none" stroke-linecap="round"/>
  </g>
  <path class="hill-near" d="M0 196 C 220 176 420 192 640 184 C 860 176 1080 168 1260 182 C 1350 189 1400 186 1440 182 L1440 240 L0 240 Z"/>
  <g class="stones">
    <path d="M300 196 v-26 a12 12 0 0 1 24 0 v26 z"/>
    <path d="M352 196 v-18 a9 9 0 0 1 18 0 v18 z"/>
    <path d="M1010 190 v-30 a14 14 0 0 1 28 0 v30 z"/>
    <path d="M1066 190 v-20 h-8 v-6 h8 v-8 h6 v8 h8 v6 h-8 v20 z"/>
    <path d="M1120 188 v-22 a10 10 0 0 1 20 0 v22 z"/>
  </g>
  <g class="fence">
    <path d="M520 196 H 900 M520 172 H 900" fill="none"/>
    ${Array.from({ length: 20 }, (_, i) => {
      const x = 524 + i * 19.5;
      return `<path d="M${x} 200 V 160 l3 -7 l3 7 V 200" />`;
    }).join('')}
  </g>
</svg>`;

/** The open grave of the drop zone. `.lid` slides aside while a file is dragged over it. */
export const GRAVE = `
<svg class="grave" viewBox="0 0 360 190" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="grave-glow" cx="50%" cy="60%" r="60%">
      <stop offset="0" stop-color="var(--spectral)" stop-opacity="0.55"/>
      <stop offset="1" stop-color="var(--spectral)" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="grave-ground" cx="50%" cy="45%" r="50%">
      <stop offset="0.55" stop-color="#14120e"/>
      <stop offset="1" stop-color="#14120e" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lid-wood" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#3a3026"/>
      <stop offset="1" stop-color="#241d17"/>
    </linearGradient>
  </defs>
  <path class="headstone" d="M138 98 V 34 a42 24 0 0 1 84 0 V 98 Z"/>
  <path class="headstone-mark" d="M180 30 v30 M167 43 h26" fill="none"/>
  <ellipse class="ground" cx="180" cy="150" rx="186" ry="58" fill="url(#grave-ground)"/>
  <path class="pit" d="M66 100 L 294 100 L 276 182 L 84 182 Z"/>
  <path class="pit-edge" d="M66 100 L 294 100" fill="none"/>
  <ellipse class="glow" cx="180" cy="146" rx="120" ry="50" fill="url(#grave-glow)"/>
  <path class="coffin" d="M122 112 L 238 112 L 250 132 L 230 172 L 130 172 L 110 132 Z"/>
  <g class="lid">
    <path d="M122 112 L 238 112 L 250 132 L 230 172 L 130 172 L 110 132 Z" fill="url(#lid-wood)"/>
    <path class="lid-cross" d="M180 122 v36 M167 134 h26" fill="none"/>
  </g>
  <path class="mound" d="M2 186 C 10 140 40 112 76 118 C 88 120 94 132 92 148 L 86 186 Z"/>
  <path class="mound" d="M358 186 C 350 140 320 112 284 118 C 272 120 266 132 268 148 L 274 186 Z"/>
  <path class="soil" d="M20 160 q 8 -6 16 0 M48 140 q 8 -6 16 0 M304 146 q 8 -6 16 0 M326 166 q 8 -6 16 0" fill="none"/>
</svg>`;

/** A heartbeat trace drawn once when the result appears. */
export const EKG = `
<svg class="ekg" viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <path d="M0 34 H 200 L 214 34 L 222 20 L 230 34 L 246 34 L 256 4 L 268 56 L 278 30 L 288 34 H 410 L 420 26 L 428 34 H 600" fill="none"/>
</svg>`;

/** Small crescent beside the wordmark. */
export const CRESCENT = `
<svg class="crescent" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <path d="M21 4 A 13 13 0 1 0 28 22 A 10 10 0 1 1 21 4 Z"/>
</svg>`;

/**
 * A moon whose lit part is `fraction` (0-1) of the disk, as a score gauge. null draws an
 * eclipsed moon (not compared). The number itself is always printed next to it as text.
 */
export function moonGauge(fraction: number | null): string {
  const r = 44;
  const c = 50;
  if (fraction === null) {
    return `<svg class="moon-gauge is-eclipsed" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle class="moon-dark" cx="${c}" cy="${c}" r="${r}"/>
      <circle class="moon-ring" cx="${c}" cy="${c}" r="${r}" fill="none"/>
    </svg>`;
  }
  const f = Math.min(1, Math.max(0, fraction));
  const rx = Math.abs(1 - 2 * f) * r;
  const sweep = f < 0.5 ? 0 : 1;
  const lit =
    f <= 0
      ? ''
      : f >= 1
        ? `<circle class="moon-lit" cx="${c}" cy="${c}" r="${r}"/>`
        : `<path class="moon-lit" d="M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} A ${rx.toFixed(2)} ${r} 0 0 ${sweep} ${c} ${c - r} Z"/>`;
  return `<svg class="moon-gauge" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle class="moon-dark" cx="${c}" cy="${c}" r="${r}"/>
    ${lit}
    <g class="moon-craters">
      <circle cx="38" cy="36" r="7"/><circle cx="62" cy="58" r="9"/><circle cx="44" cy="68" r="4"/><circle cx="66" cy="32" r="3"/>
    </g>
    <circle class="moon-ring" cx="${c}" cy="${c}" r="${r}" fill="none"/>
  </svg>`;
}

/** The seven phases of the moon row beside "The ritual", left to right. */
export const MOON_PHASES = ['waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent'] as const;
export type MoonPhase = (typeof MOON_PHASES)[number];

/** How much of the disc is lit (0 to 1); a thin crescent is about a fifth. */
const LIT: Record<MoonPhase, number> = {
  'waxing-crescent': 0.2,
  'first-quarter': 0.5,
  'waxing-gibbous': 0.8,
  full: 1,
  'waning-gibbous': 0.8,
  'last-quarter': 0.5,
  'waning-crescent': 0.2,
};

/**
 * A lit area as an SVG path, for a disc of radius r centred at (c, c): the outer half-circle on the
 * lit side plus the terminator, a half-ellipse of horizontal radius k = r * |1 - 2 * lit|, bulging
 * toward the lit side when less than half is lit and away from it when more is (straight at a half).
 */
function phasePath(lit: number, right: boolean, c: number, r: number): string {
  const fmt = (n: number): string => String(Math.round(n * 100) / 100);
  if (lit >= 1) return `M${fmt(c - r)},${fmt(c)}A${fmt(r)},${fmt(r)} 0 1 1 ${fmt(c + r)},${fmt(c)}A${fmt(r)},${fmt(r)} 0 1 1 ${fmt(c - r)},${fmt(c)}Z`;
  const k = r * Math.abs(1 - 2 * lit);
  const top = `${fmt(c)},${fmt(c - r)}`;
  const bottom = `${fmt(c)},${fmt(c + r)}`;
  // The outer edge, top to bottom, on the lit side (clockwise on the right, counter-clockwise on the left).
  const outer = `A${fmt(r)},${fmt(r)} 0 0 ${right ? 1 : 0} ${bottom}`;
  // The terminator, bottom back to top: toward the lit side under a half, away from it over a half.
  const throughRight = right === lit < 0.5;
  const terminator = `A${fmt(k)},${fmt(r)} 0 0 ${throughRight ? 0 : 1} ${top}`;
  return `M${top}${outer}${terminator}Z`;
}

/** Waxing moons (and the first quarter) are lit on the right, waning ones on the left. */
function litOnRight(phase: MoonPhase): boolean {
  return phase.startsWith('waxing') || phase === 'first-quarter';
}

/** The lit part of a moon as an SVG path. Pure, so it can be tested. */
export function moonLitPath(phase: MoonPhase, c: number, r: number): string {
  return phasePath(LIT[phase], litOnRight(phase), c, r);
}

/**
 * The unlit part of a moon: the lit shape of the opposite fraction on the other side. Null for the
 * full moon. Pure, so it can be tested.
 */
export function moonShadowPath(phase: MoonPhase, c: number, r: number): string | null {
  const lit = LIT[phase];
  return lit >= 1 ? null : phasePath(1 - lit, !litOnRight(phase), c, r);
}

/**
 * One moon of the row: the painted moon (art/moon-disc.webp) as its surface, the unlit part laid
 * over it as a dark shadow (#070d12 at 88 %) with a soft terminator (0.5 px blur), clipped to the
 * disc so the unlit side stays faintly visible like earthshine; a 1 px ring at 20 %. 22 px, the full
 * moon 28 px. Decorative.
 */
export function moonSvg(phase: MoonPhase): string {
  const size = phase === 'full' ? 28 : 22;
  const c = size / 2;
  const r = c - 0.5;
  const id = `moon-${phase}`;
  const shadow = moonShadowPath(phase, c, r);
  return (
    `<svg class="moon-phase is-${phase}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">` +
    `<defs><clipPath id="${id}-disc"><circle cx="${c}" cy="${c}" r="${r}"/></clipPath>` +
    `<filter id="${id}-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="0.5"/></filter></defs>` +
    `<image class="moon-surface" href="/art/moon-disc.webp" x="${c - r}" y="${c - r}" width="${2 * r}" height="${2 * r}" clip-path="url(#${id}-disc)"/>` +
    (shadow === null ? '' : `<g clip-path="url(#${id}-disc)"><path class="moon-shadow" d="${shadow}" filter="url(#${id}-soft)"/></g>`) +
    `<circle class="moon-ring" cx="${c}" cy="${c}" r="${r}"/></svg>`
  );
}
