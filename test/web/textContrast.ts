/// <reference path="../../src/verify/edge/pngjs.d.ts" />
// Measures WCAG contrast of every visible text on a page against what is really behind it: the page
// is captured once with all text made transparent, and each text's box is sampled from that capture.
// Used by the web contrast test (brief 3: every text reaches AA against its real background).
import { decodePng } from '../../src/verify/edge/png';
import type { Page } from 'playwright';

export interface ContrastFinding {
  text: string;
  selector: string;
  ratio: number;
  required: number;
  color: string;
  fontSize: number;
}

interface TextItem {
  text: string;
  selector: string;
  color: [number, number, number, number];
  fontSize: number;
  bold: boolean;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Runs in the page: each visible text node with its colour, size and boxes in page coordinates. */
const COLLECT = String.raw`(() => {
    const out = [];
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    };
    const path = (el) => {
      const parts = [];
      for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
        parts.unshift(e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : ''));
      }
      return parts.join(' > ');
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim();
      const el = n.parentElement;
      if (text === '' || el === null) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      if (el.closest('[hidden], .sr-only, [aria-hidden="true"]')) continue;
      // The content of a closed <details> is not shown, though it still reports boxes.
      const closed = el.closest('details:not([open])');
      if (closed && !el.closest('summary')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()]
        .filter((r) => r.width >= 2 && r.height >= 2)
        .map((r) => ({ x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height }));
      if (rects.length === 0) continue;
      out.push({ text: text.slice(0, 60), selector: path(el), color: parse(cs.color), fontSize: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 700, rects });
    }
    return out;
  })()`;

/**
 * Every text of the page whose contrast with the pixels behind it falls short of AA (4.5:1, or 3:1
 * for large text: 24 px, or 18.66 px bold). Per text box, the 10th-percentile contrast over its
 * background pixels is used, so a busy backdrop counts where it is light and a stray border pixel
 * does not. The viewport is made as tall as the page first.
 */
export async function lowContrastTexts(page: Page): Promise<ContrastFinding[]> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const width = page.viewportSize()?.width ?? 1200;
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // Passed as text: the test runner's transform would add helpers the page does not have.
  const items = (await page.evaluate(COLLECT)) as TextItem[];

  const hide = await page.addStyleTag({
    content: '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important; }',
  });
  await page.waitForTimeout(150);
  const png = decodePng(await page.screenshot({ fullPage: true }));
  await hide.evaluate((el) => {
    el.parentNode?.removeChild(el);
  });

  const findings: ContrastFinding[] = [];
  for (const it of items) {
    const [tr, tg, tb, ta] = it.color;
    const ratios: number[] = [];
    for (const r of it.rects) {
      const x0 = Math.max(0, Math.floor(r.x));
      const y0 = Math.max(0, Math.floor(r.y));
      const x1 = Math.min(png.width, Math.ceil(r.x + r.w));
      const y1 = Math.min(png.height, Math.ceil(r.y + r.h));
      const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 8));
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          const k = (y * png.width + x) * 4;
          const [br, bg, bb] = [png.data[k], png.data[k + 1], png.data[k + 2]];
          // Translucent text is seen blended over its background.
          const fr = tr * ta + br * (1 - ta);
          const fg = tg * ta + bg * (1 - ta);
          const fb = tb * ta + bb * (1 - ta);
          ratios.push(contrast(luminance(fr, fg, fb), luminance(br, bg, bb)));
        }
      }
    }
    if (ratios.length === 0) continue;
    ratios.sort((a, b) => a - b);
    const ratio = ratios[Math.floor(ratios.length * 0.1)];
    const large = it.fontSize >= 24 || (it.bold && it.fontSize >= 18.66);
    const required = large ? 3 : 4.5;
    if (ratio < required) {
      findings.push({ text: it.text, selector: it.selector, ratio: Math.round(ratio * 100) / 100, required, color: `rgba(${it.color.join(',')})`, fontSize: it.fontSize });
    }
  }
  return findings;
}
