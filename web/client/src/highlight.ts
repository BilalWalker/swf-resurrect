// A small TypeScript tokenizer for the read-only code viewer. Pure: text in, lines of tokens out.
// It only colours; it never changes the text (joining all token texts gives the input back).

export type TokenType = 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'type';

export interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS = new Set(
  (
    'abstract any as async await boolean break case catch class const constructor continue debugger declare default ' +
    'delete do else enum export extends false finally for from function get if implements import in instanceof ' +
    'interface let new null number of override private protected public readonly return set static string super ' +
    'switch this throw true try type typeof undefined unknown var void while yield never'
  ).split(' '),
);

const IDENT_START = /[A-Za-z_$]/;
const IDENT = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const push = (type: TokenType, text: string): void => {
    if (text === '') return;
    const last = out[out.length - 1];
    if (last !== undefined && last.type === type && type === 'plain') last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      push('comment', src.slice(i, j));
      i = j;
    } else if (c === '/' && c2 === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j < 0 ? n : j + 2;
      push('comment', src.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n' && c !== '`') break;
        j++;
      }
      j = Math.min(j + 1, n);
      push('string', src.slice(i, j));
      i = j;
    } else if (DIGIT.test(c) || (c === '.' && c2 !== undefined && DIGIT.test(c2))) {
      let j = i + 1;
      while (j < n && /[0-9a-fA-FxXoObB._n]/.test(src[j])) j++;
      push('number', src.slice(i, j));
      i = j;
    } else if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT.test(src[j])) j++;
      const word = src.slice(i, j);
      const prev = i > 0 ? src[i - 1] : '';
      if (KEYWORDS.has(word) && prev !== '.') push('keyword', word);
      else if (/^[A-Z]/.test(word)) push('type', word);
      else push('plain', word);
      i = j;
    } else {
      push('plain', c);
      i++;
    }
  }
  return out;
}

/** Tokens split at line breaks: one array per line (line breaks themselves are dropped). */
export function tokenLines(src: string): Token[][] {
  const lines: Token[][] = [[]];
  for (const t of tokenize(src.replace(/\r\n/g, '\n'))) {
    const parts = t.text.split('\n');
    parts.forEach((p, k) => {
      if (k > 0) lines.push([]);
      if (p !== '') lines[lines.length - 1].push({ type: t.type, text: p });
    });
  }
  return lines;
}
