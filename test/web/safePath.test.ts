import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveInside } from '../../web/server/safePath';

const root = resolve('/srv/jobs/abc');

describe('resolveInside', () => {
  it('resolves plain and nested paths inside the root', () => {
    expect(resolveInside(root, 'index.html')).toEqual({ ok: true, path: join(root, 'index.html'), relative: 'index.html' });
    const nested = resolveInside(root, 'assets/scene.json');
    expect(nested).toEqual({ ok: true, path: join(root, 'assets', 'scene.json'), relative: 'assets/scene.json' });
  });

  it('decodes percent-encoding of ordinary characters', () => {
    const r = resolveInside(root, 'my%20file.ts');
    expect(r).toEqual({ ok: true, path: join(root, 'my file.ts'), relative: 'my file.ts' });
  });

  it('uses the fallback for an empty tail only', () => {
    expect(resolveInside(root, '', 'index.html')).toMatchObject({ ok: true, relative: 'index.html' });
    expect(resolveInside(root, '').ok).toBe(false);
  });

  const refused: Array<[string, string]> = [
    ['parent segment', '../secret'],
    ['nested parent segment', 'assets/../../secret'],
    ['parent segment at the end', 'assets/..'],
    ['encoded dots', '%2e%2e/secret'],
    ['encoded dots, upper case', '%2E%2E/secret'],
    ['encoded slash', '..%2fsecret'],
    ['double-encoded dots stay literal but encoded slash is refused', '%252e%252e%2f'],
    ['single dot', './index.html'],
    ['empty segment', 'assets//scene.json'],
    ['trailing slash (directory listing)', 'assets/'],
    ['leading slash', '/etc/passwd'],
    ['encoded leading slash', '%2fetc%2fpasswd'],
    ['backslash', '..\\secret'],
    ['encoded backslash', '..%5csecret'],
    ['windows absolute', 'C:/Windows/win.ini'],
    ['windows drive relative', 'C:secret'],
    ['UNC path', '%5c%5cserver%5cshare'],
    ['NUL byte', 'index.html%00.png'],
    ['bad encoding', '%E0%A4%A'],
  ];
  for (const [name, tail] of refused) {
    it(`refuses ${name}: ${tail}`, () => {
      expect(resolveInside(root, tail).ok).toBe(false);
    });
  }

  it('never returns a path outside the root for arbitrary dotted inputs', () => {
    const parts = ['..', '.', 'a', '%2e', '%2e%2e', '%2f', '%5c', '', 'b.txt'];
    for (const a of parts) {
      for (const b of parts) {
        for (const c of parts) {
          const r = resolveInside(root, [a, b, c].join('/'));
          if (r.ok) expect(r.path.startsWith(root)).toBe(true);
        }
      }
    }
  });
});
