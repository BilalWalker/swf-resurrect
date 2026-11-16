import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HandwrittenSetError,
  classifyOverrides,
  listOverrideClasses,
  overrideClassName,
  parseHandwrittenSet,
  readHandwrittenSet,
} from '../../src/pipeline/handwrittenSet';

const root = fileURLToPath(new URL('../../handwritten/', import.meta.url));

describe('parseHandwrittenSet (Requirement 33.8)', () => {
  it('accepts an empty list and a full entry with the optional licence', () => {
    expect(parseHandwrittenSet('[]')).toEqual([]);
    const text = JSON.stringify([{ sample: 's', className: 'a.B', reason: 'r', licence: 'GPL-3.0' }, { sample: 's', className: 'C', reason: 'r' }]);
    expect(parseHandwrittenSet(text)).toEqual([
      { sample: 's', className: 'a.B', reason: 'r', licence: 'GPL-3.0' },
      { sample: 's', className: 'C', reason: 'r' },
    ]);
  });

  it.each([
    ['not json', '{'],
    ['not an array', '{}'],
    ['a non-object entry', '[1]'],
    ['a missing reason', '[{"sample":"s","className":"C"}]'],
    ['an empty className', '[{"sample":"s","className":"","reason":"r"}]'],
    ['an unknown key', '[{"sample":"s","className":"C","reason":"r","why":"x"}]'],
    ['an empty licence', '[{"sample":"s","className":"C","reason":"r","licence":""}]'],
    ['a duplicate', '[{"sample":"s","className":"C","reason":"r"},{"sample":"s","className":"C","reason":"q"}]'],
  ])('rejects %s', (_name, text) => {
    expect(() => parseHandwrittenSet(text)).toThrow(HandwrittenSetError);
  });
});

describe('override class names', () => {
  it('turns a packaged override path into a qualified class name', () => {
    expect(overrideClassName('Cls.ts')).toBe('Cls');
    expect(overrideClassName('a/b/Cls.ts')).toBe('a.b.Cls');
    expect(overrideClassName('a\\b\\Cls.ts')).toBe('a.b.Cls');
  });

  it('lists packaged overrides qualified so they are not reported as missing (Requirement 18.6)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hw-'));
    try {
      await mkdir(join(dir, 'a', 'b'), { recursive: true });
      await writeFile(join(dir, 'Top.ts'), '');
      await writeFile(join(dir, 'a', 'b', 'Cls.ts'), '');
      await writeFile(join(dir, 'a', 'notes.md'), '');
      expect(await listOverrideClasses(dir)).toEqual(['Top', 'a.b.Cls']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('classifyOverrides', () => {
  const set = [{ sample: 's', className: 'A', reason: 'ra' }];
  it('splits by sample and class and marks a replaced translated class', () => {
    const r = classifyOverrides('s', ['B', 'A'], set, new Set(['A']));
    expect(r.listed).toEqual([{ className: 'A', reason: 'ra', replacesTranslated: true }]);
    expect(r.unlisted).toEqual(['B']);
    expect(classifyOverrides('other', ['A'], set).unlisted).toEqual(['A']);
  });
});

describe('the committed handwritten/ directory (Requirement 33.8)', () => {
  async function tsFiles(dir: string, prefix = ''): Promise<string[]> {
    const out: string[] = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? e.name : `${prefix}/${e.name}`;
      if (e.isDirectory()) out.push(...(await tsFiles(join(dir, e.name), rel)));
      else if (e.name.endsWith('.ts')) out.push(rel);
    }
    return out;
  }

  it('lists every .ts file and has a file for every entry', async () => {
    const set = await readHandwrittenSet(root);
    const listed = new Set(set.map((e) => `${e.sample}/${e.className.split('.').join('/')}.ts`));
    const files = new Set<string>();
    for (const e of await readdir(root, { withFileTypes: true })) {
      if (e.isDirectory()) for (const f of await tsFiles(join(root, e.name))) files.add(`${e.name}/${f}`);
    }
    expect([...files].filter((f) => !listed.has(f))).toEqual([]);
    expect([...listed].filter((f) => !files.has(f))).toEqual([]);
  });
});
