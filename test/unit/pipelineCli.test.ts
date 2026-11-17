import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/pipeline/handwrittenSet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/pipeline/handwrittenSet')>();
  return {
    ...actual,
    readHandwrittenSet: vi.fn(async () => {
      throw new Error('EACCES: cannot read handwritten/SET.json');
    }),
  };
});

import { main } from '../../src/pipeline/cli';

describe('pipeline CLI: unreadable handwritten/SET.json (S2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints the exception text on one error line and returns 2', async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stderr.write);
    const code = await main(['in.swf', 'out-dir']);
    const text = chunks.join('');
    expect(code).toBe(2);
    expect(text).toContain('EACCES: cannot read handwritten/SET.json');
    expect(text).not.toContain('${');
    expect(text).toBe('error [pipeline]: EACCES: cannot read handwritten/SET.json\n');
  });
});
