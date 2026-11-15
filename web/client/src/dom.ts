// Tiny DOM helpers. Text always goes in through textContent, never innerHTML, so names and
// messages from the pipeline (which come from untrusted SWFs) cannot inject markup.

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, ...children);
  return el;
}

export function append(el: Element, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

/** Parses trusted, static SVG markup written in this code base (never data from a job). */
export function svg(markup: string): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const el = t.content.firstElementChild;
  if (!(el instanceof SVGSVGElement)) throw new Error('not an svg');
  return el;
}

export function clear(el: Element): void {
  el.replaceChildren();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function pct(v: number): string {
  return `${v.toFixed(2)}%`;
}

/** Announces text to screen readers through the page's polite live region. */
export function announce(text: string): void {
  const region = document.getElementById('announcer');
  if (region === null) return;
  region.textContent = '';
  // A separate task, so the same text announced twice is still read.
  window.setTimeout(() => {
    region.textContent = text;
  }, 50);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
