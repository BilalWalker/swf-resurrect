// The grimoire: a read-only viewer for the generated TypeScript (file list + source).
import type { ClassRow, SourceFile } from '../../shared/api';
import { api } from './api';
import { formatBytes, h } from './dom';
import { tokenLines } from './highlight';

const MAX_SHOWN_BYTES = 512 * 1024;

export function renderGrimoire(container: HTMLElement, jobId: string, classes: readonly ClassRow[]): void {
  const translated = new Map(classes.filter((c) => c.path !== null).map((c) => [c.path as string, c]));
  const list = h('ul', { class: 'grimoire-files', 'aria-label': 'Generated source files' });
  const caption = h('p', { class: 'grimoire-caption' });
  const code = h('code', {});
  const pre = h('pre', { class: 'grimoire-code', tabindex: '0', 'aria-label': 'Source code' }, code);
  const viewer = h('div', { class: 'grimoire-view' }, caption, pre);
  container.replaceChildren(h('p', { class: 'loading' }, 'Opening the grimoire...'));

  let current: HTMLButtonElement | null = null;
  let token = 0;
  const open = async (file: SourceFile, button: HTMLButtonElement): Promise<void> => {
    const mine = ++token;
    current?.removeAttribute('aria-current');
    button.setAttribute('aria-current', 'true');
    current = button;
    caption.textContent = `${file.path} · ${formatBytes(file.bytes)}`;
    code.replaceChildren(h('span', { class: 'muted' }, 'Reading...'));
    if (file.bytes > MAX_SHOWN_BYTES) {
      code.replaceChildren(h('span', { class: 'muted' }, 'This file is too large to show here; it is in the zip.'));
      return;
    }
    try {
      const text = await api.sourceText(jobId, file.path);
      if (mine !== token) return;
      const frag = document.createDocumentFragment();
      for (const line of tokenLines(text)) {
        const row = h('span', { class: 'ln' });
        for (const t of line) row.append(t.type === 'plain' ? document.createTextNode(t.text) : h('span', { class: `tk-${t.type}` }, t.text));
        row.append('\n');
        frag.append(row);
      }
      code.replaceChildren(frag);
      pre.scrollTop = 0;
    } catch (err) {
      if (mine !== token) return;
      code.replaceChildren(h('span', { class: 'error-text' }, err instanceof Error ? err.message : String(err)));
    }
  };

  api.sources(jobId).then(
    (files) => {
      if (files.length === 0) {
        container.replaceChildren(h('p', { class: 'muted' }, 'The grimoire is empty: no generated source files were found.'));
        return;
      }
      let first: [SourceFile, HTMLButtonElement] | null = null;
      for (const f of files) {
        const cls = translated.get(f.path);
        const button = h(
          'button',
          { type: 'button', class: 'grimoire-file' },
          h('span', { class: 'grimoire-name' }, f.path.replace(/^src\//, '')),
          h('span', { class: 'grimoire-kind' }, cls !== undefined ? `translated, ${cls.status}` : 'scaffolding'),
        );
        button.addEventListener('click', () => void open(f, button));
        list.append(h('li', {}, button));
        if (first === null && cls !== undefined) first = [f, button];
      }
      if (first === null) first = [files[0], list.querySelector('button') as HTMLButtonElement];
      container.replaceChildren(
        h(
          'p',
          { class: 'muted grimoire-intro' },
          'The TypeScript in the emitted project’s src/ folder. "Translated" files come from the SWF’s ActionScript classes; the others are the project’s scaffolding (entry point and class registry).',
        ),
        h('div', { class: 'grimoire' }, h('nav', { 'aria-label': 'Files' }, list), viewer),
      );
      void open(first[0], first[1]);
    },
    (err: unknown) => {
      container.replaceChildren(h('p', { class: 'error-text' }, err instanceof Error ? err.message : String(err)));
    },
  );
}
