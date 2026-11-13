// Static HTML for the Fidelity_Report (design section 10).
// Pure: no node:* imports, no clock, no randomness, no locale-dependent calls.
// No script, no external resource, inline style only, images by relative path.
import type { InputNote } from './inputNotes';
import type { FidelityReport, VisualFrame } from './report';

/** Escapes & < > " ' (in that order of concern: & first via single pass). */
export function escapeHtml(text: string): string {
  let out = '';
  for (const ch of text) {
    switch (ch) {
      case '&':
        out += '&amp;';
        break;
      case '<':
        out += '&lt;';
        break;
      case '>':
        out += '&gt;';
        break;
      case '"':
        out += '&quot;';
        break;
      case "'":
        out += '&#39;';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

const e = escapeHtml;

function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}

const STYLE = [
  'body{font-family:sans-serif;margin:1.5em;color:#111;background:#fff}',
  'table{border-collapse:collapse}',
  'th,td{border:1px solid #888;padding:.25em .6em;text-align:left;vertical-align:top}',
  'figure{display:inline-block;margin:0 .75em .75em 0}',
  'figcaption{font-size:.9em}',
  'img{max-width:100%;height:auto;border:1px solid #888}',
  '.ok{color:#0a5c0a;font-weight:bold}',
  '.bad{color:#a00000;font-weight:bold}',
  'pre{margin:0;white-space:pre-wrap}',
].join('\n');

function frameState(f: Extract<VisualFrame, { status: 'compared' }>): string {
  return f.differingPixels === 0
    ? '<span class="ok">PASS (no differing pixels)</span>'
    : `<span class="bad">DIFFERENCES (${f.differingPixels} pixels)</span>`;
}

function summarySection(r: FidelityReport): string {
  const b = r.behaviour;
  const rows: string[] = [];
  rows.push(
    `<tr><th scope="row">Overall match</th><td>${r.visual.overallMatch === null ? 'not compared' : pct(r.visual.overallMatch)}</td></tr>`,
  );
  rows.push(`<tr><th scope="row">Compared frames</th><td>${r.visual.comparedFrames}</td></tr>`);
  rows.push(`<tr><th scope="row">Not compared frames</th><td>${r.visual.notComparedFrames}</td></tr>`);
  rows.push(
    `<tr><th scope="row">Trace score</th><td>${b.status === 'compared' ? pct(b.traceScore) : `not compared (${e(b.reason)})`}</td></tr>`,
  );
  if (b.status === 'compared') {
    const d = b.firstDivergence;
    rows.push(
      `<tr><th scope="row">First divergence</th><td>${
        d === null
          ? 'none'
          : `line ${d.index}<br>reference: ${d.reference === null ? '(end of trace)' : e(d.reference)}<br>captured: ${d.captured === null ? '(end of trace)' : e(d.captured)}`
      }</td></tr>`,
    );
  }
  const t = r.tolerance;
  rows.push(
    `<tr><th scope="row">Tolerance</th><td>background ${e(t.background)}, strict ${t.strict}, edge max ${t.edgeMax}, edge contrast ${t.edgeContrast}, neighbourhood ${e(t.neighbourhood)}</td></tr>`,
  );
  rows.push(
    `<tr><th scope="row">Tools</th><td>FFDec ${e(r.tools.ffdec)}, Playwright ${e(r.tools.playwright)}, pngjs ${e(r.tools.pngjs)}</td></tr>`,
  );
  rows.push(`<tr><th scope="row">Stage</th><td>${r.stage.width} x ${r.stage.height}</td></tr>`);
  return `<section aria-labelledby="summary">\n<h2 id="summary">Summary</h2>\n<table>\n${rows.join('\n')}\n</table>\n</section>`;
}

function visualSection(r: FidelityReport): string {
  const parts: string[] = ['<section aria-labelledby="visual">', '<h2 id="visual">Visual comparison</h2>'];
  const notCompared: string[] = [];
  for (const f of r.visual.frames) {
    if (f.status === 'compared') {
      const n = f.frame;
      const img = (src: string, kind: string): string =>
        `<img src="${e(src)}" alt="Frame ${n} ${kind}">`;
      parts.push(
        `<div class="frame">\n<p>Frame ${n}: ${pct(f.matchPercent)} ${frameState(f)}</p>\n` +
          `<figure>${img(f.images.reference, 'reference')}<figcaption>Reference</figcaption></figure>\n` +
          `<figure>${img(f.images.rendered, 'rendered')}<figcaption>Rendered</figcaption></figure>\n` +
          `<figure>${img(f.images.diff, 'pixel difference')}<figcaption>Pixel difference</figcaption></figure>\n</div>`,
      );
    } else {
      notCompared.push(`<li>Frame ${f.frame}: not compared (${e(f.reason)})</li>`);
    }
  }
  if (notCompared.length > 0) {
    parts.push('<h3>Frames not compared</h3>', `<ul>\n${notCompared.join('\n')}\n</ul>`);
  }
  parts.push('<h3>Known visual limits</h3>');
  if (r.visual.knownVisualLimits.length === 0) {
    parts.push('<p>none</p>');
  } else {
    const items = r.visual.knownVisualLimits.map(
      (l) => `<li>${e(l.kind)}${l.id === undefined ? '' : ` (id ${l.id})`}: ${e(l.message)}</li>`,
    );
    parts.push(`<ul>\n${items.join('\n')}\n</ul>`);
  }
  parts.push('</section>');
  return parts.join('\n');
}

function inputNotesTable(notes: readonly InputNote[]): string {
  if (notes.length === 0) return '<h3>Input notes (0)</h3>\n<p>none</p>';
  const rows = notes.map((n) => {
    const detail =
      n.kind === 'release-outside'
        ? `pressed ${n.pressed}, released over ${n.hit}; MouseDown at entry ${n.downIndex}`
        : n.kind === 'unsupported-input'
          ? n.detail
          : '';
    return `<tr><td>${e(n.kind)}</td><td>${n.index}</td><td>${e(detail)}</td></tr>`;
  });
  return (
    `<h3>Input notes (${notes.length})</h3>\n<table>\n<caption>Replay input entries that explain a difference</caption>\n` +
    `<tr><th scope="col">Kind</th><th scope="col">Entry</th><th scope="col">Detail</th></tr>\n${rows.join('\n')}\n</table>`
  );
}

function behaviourSection(r: FidelityReport): string {
  const b = r.behaviour;
  const parts: string[] = ['<section aria-labelledby="behaviour">', '<h2 id="behaviour">Behaviour comparison</h2>'];
  if (b.status === 'not-compared') {
    parts.push(`<p>Not compared (${e(b.reason)})</p>`);
  } else {
    const same = b.missing.length === 0 && b.extra.length === 0;
    parts.push(
      same
        ? '<p><span class="ok">PASS (traces identical)</span></p>'
        : `<p><span class="bad">MISMATCH (${b.missing.length} missing, ${b.extra.length} extra)</span></p>`,
    );
    parts.push(
      `<p>Reference lines: ${b.referenceLineCount}, captured lines: ${b.capturedLineCount}, matched: ${b.matched}</p>`,
      `<p>Replay: ${b.replay.ticks} ticks, ${b.replay.inputGroups} input groups, ${b.replay.clicks} clicks, ${b.replay.pointerEvents} pointer events</p>`,
    );
    parts.push(inputNotesTable(b.replay.inputNotes));
    const d = b.firstDivergence;
    if (d !== null) {
      parts.push(
        `<p>First divergence at line ${d.index}:</p>`,
        `<pre>reference: ${d.reference === null ? '(end of trace)' : e(d.reference)}</pre>`,
        `<pre>captured: ${d.captured === null ? '(end of trace)' : e(d.captured)}</pre>`,
      );
    }
    const list = (title: string, lines: ReadonlyArray<{ line: number; text: string }>): void => {
      parts.push(`<h3>${title} (${lines.length})</h3>`);
      if (lines.length === 0) {
        parts.push('<p>none</p>');
        return;
      }
      const items = lines.map((l) => `<li value="${l.line}"><pre>${e(l.text)}</pre></li>`);
      parts.push(`<ol>\n${items.join('\n')}\n</ol>`);
    };
    list('Missing lines', b.missing);
    list('Extra lines', b.extra);
  }
  parts.push('<h3>Known behaviour gaps</h3>');
  if (b.knownBehaviourGaps.length === 0) {
    parts.push('<p>none</p>');
  } else {
    parts.push(`<ul>\n${b.knownBehaviourGaps.map((g) => `<li>${e(g)}</li>`).join('\n')}\n</ul>`);
  }
  parts.push('</section>');
  return parts.join('\n');
}

function problemsSection(r: FidelityReport): string {
  const parts: string[] = ['<section aria-labelledby="problems">', '<h2 id="problems">Problems</h2>'];
  if (r.problems.length === 0) {
    parts.push('<p>none</p>');
  } else {
    const rows = r.problems.map((p) => {
      const where: string[] = [];
      if (p.frame !== undefined) where.push(`frame ${p.frame}`);
      if (p.index !== undefined) where.push(`index ${p.index}`);
      if (p.tick !== undefined) where.push(`tick ${p.tick}`);
      return `<tr><td>${e(p.kind)}</td><td>${where.join(', ')}</td><td>${p.detail === undefined ? '' : e(p.detail)}</td></tr>`;
    });
    parts.push(
      `<table>\n<tr><th scope="col">Kind</th><th scope="col">Where</th><th scope="col">Detail</th></tr>\n${rows.join('\n')}\n</table>`,
    );
  }
  parts.push('</section>');
  return parts.join('\n');
}

function translationSection(r: FidelityReport): string {
  const parts: string[] = [
    '<section aria-labelledby="translation">',
    '<h2 id="translation">Translation</h2>',
    `<p>Type check: ${e(r.translation.typeCheck)}</p>`,
  ];
  if (r.translation.classes.length === 0) {
    parts.push('<p>No classes.</p>');
  } else {
    const rows = r.translation.classes.map(
      (c) => `<tr><td>${e(c.className)}</td><td>${e(c.status)}</td><td>${c.overridden ? 'yes' : 'no'}</td></tr>`,
    );
    parts.push(
      `<table>\n<tr><th scope="col">Class</th><th scope="col">Status</th><th scope="col">Overridden</th></tr>\n${rows.join('\n')}\n</table>`,
    );
  }
  parts.push('</section>');
  return parts.join('\n');
}

export function renderFidelityHtml(report: FidelityReport): string {
  const title = `Fidelity report: ${e(report.sample)}`;
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<style>\n${STYLE}\n</style>`,
    '</head>',
    '<body>',
    `<h1>${title}</h1>`,
    summarySection(report),
    visualSection(report),
    behaviourSection(report),
    problemsSection(report),
    translationSection(report),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
