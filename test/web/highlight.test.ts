import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tokenize, tokenLines } from '../../web/client/src/highlight';

describe('tokenize', () => {
  it('colours keywords, types, strings, numbers and comments', () => {
    const toks = tokenize("import { MovieClip } from '../shim'; // hi\nconst n = 0x1F + 2.5;");
    const of = (type: string): string[] => toks.filter((t) => t.type === type).map((t) => t.text);
    expect(of('keyword')).toEqual(['import', 'from', 'const']);
    expect(of('type')).toEqual(['MovieClip']);
    expect(of('string')).toEqual(["'../shim'"]);
    expect(of('comment')).toEqual(['// hi']);
    expect(of('number')).toEqual(['0x1F', '2.5']);
  });

  it('handles escapes, block comments and template strings across lines', () => {
    const toks = tokenize('const s = "a\\"b"; /* x\ny */ `t\n${1}`');
    expect(toks.filter((t) => t.type === 'string').map((t) => t.text)).toEqual(['"a\\"b"', '`t\n${1}`']);
    expect(toks.find((t) => t.type === 'comment')?.text).toBe('/* x\ny */');
  });

  it('does not treat property names as keywords', () => {
    expect(tokenize('this.default').filter((t) => t.type === 'keyword').map((t) => t.text)).toEqual(['this']);
  });

  it('never changes the text, and tokenLines keeps the line count', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        expect(tokenize(s).map((t) => t.text).join('')).toBe(s);
        const lines = tokenLines(s);
        expect(lines.length).toBe(s.replace(/\r\n/g, '\n').split('\n').length);
        expect(lines.map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(s.replace(/\r\n/g, '\n'));
      }),
    );
  });

  it('survives unterminated strings and comments', () => {
    expect(tokenize('"abc').map((t) => t.type)).toEqual(['string']);
    expect(tokenize('/* abc').map((t) => t.type)).toEqual(['comment']);
  });
});
