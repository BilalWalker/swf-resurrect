// AS3 lexer. Pure: no node:* imports, no regular expressions on source text.
// Token offsets refer to the normalised source (see normalizeNewlines).

export type TokenKind = 'id' | 'num' | 'str' | 'regex' | 'punct' | 'comment' | 'bad';

export interface Token {
  kind: TokenKind;
  text: string;
  /** Offset of the first character in the normalised source. */
  start: number;
  /** Offset one past the last character. */
  end: number;
  /** 1-based line of the first character. */
  line: number;
  /** 1-based line of the last character. */
  endLine: number;
}

/** Replace every `\r\n` with `\n`. A lone `\r` is kept. */
export function normalizeNewlines(source: string): string {
  if (source.indexOf('\r\n') < 0) return source;
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c === 13 && source.charCodeAt(i + 1) === 10) continue;
    out += source[i];
  }
  return out;
}

const PUNCT4 = ['>>>='];
const PUNCT3 = ['...', '===', '!==', '>>>', '<<=', '>>=', '&&=', '||='];
const PUNCT2 = [
  '.<', '::', '..', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=',
  '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
];
const PUNCT1 = '{}()[];,.<>+-*/%&|^!~?:=@';

/** Keywords after which a `/` starts a regex literal rather than a division. */
const REGEX_AFTER_KEYWORDS: ReadonlySet<string> = new Set([
  'return', 'typeof', 'case', 'in', 'is', 'as', 'instanceof', 'new', 'delete',
  'throw', 'void', 'else', 'do', 'each',
]);

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function isHexDigit(c: number): boolean {
  return isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

function isIdStart(c: number): boolean {
  if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36) return true;
  return c > 127 && !isUnicodeSpace(c);
}

function isIdPart(c: number): boolean {
  return isIdStart(c) || isDigit(c);
}

function isUnicodeSpace(c: number): boolean {
  return c === 0xa0 || c === 0xfeff || c === 0x2028 || c === 0x2029;
}

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12 || isUnicodeSpace(c);
}

export function tokenize(source: string): Token[] {
  const src = normalizeNewlines(source);
  const n = src.length;
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  /** Previous significant (non-comment) token. */
  let prev: Token | null = null;

  const push = (kind: TokenKind, start: number, end: number, startLine: number): void => {
    const text = src.slice(start, end);
    let endLine = startLine;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) endLine++;
    // `endLine` is the line of the last character: a token that swallows a final
    // newline (unterminated comment or string up to EOF) ends on the line that newline ends.
    const lastIsNewline = text.length > 0 && text.charCodeAt(text.length - 1) === 10;
    const tok: Token = { kind, text, start, end, line: startLine, endLine: lastIsNewline ? endLine - 1 : endLine };
    tokens.push(tok);
    if (kind !== 'comment') prev = tok;
    line = endLine;
    pos = end;
  };

  const regexAllowed = (): boolean => {
    const p = prev;
    if (p === null) return true;
    if (p.kind === 'num' || p.kind === 'str' || p.kind === 'regex') return false;
    if (p.kind === 'id') return REGEX_AFTER_KEYWORDS.has(p.text);
    if (p.kind === 'punct') return !(p.text === ')' || p.text === ']');
    return true;
  };

  while (pos < n) {
    const c = src.charCodeAt(pos);
    if (c === 10) {
      line++;
      pos++;
      continue;
    }
    if (isSpace(c)) {
      pos++;
      continue;
    }
    const start = pos;
    const startLine = line;
    const next = pos + 1 < n ? src.charCodeAt(pos + 1) : -1;

    // Comments
    if (c === 47 && next === 47) {
      let e = pos + 2;
      while (e < n && src.charCodeAt(e) !== 10) e++;
      push('comment', start, e, startLine);
      continue;
    }
    if (c === 47 && next === 42) {
      const close = src.indexOf('*/', pos + 2);
      if (close < 0) push('bad', start, n, startLine);
      else push('comment', start, close + 2, startLine);
      continue;
    }

    // Identifiers
    if (isIdStart(c)) {
      let e = pos + 1;
      while (e < n && isIdPart(src.charCodeAt(e))) e++;
      push('id', start, e, startLine);
      continue;
    }

    // Numbers (a leading `.` followed by a digit is a number)
    if (isDigit(c) || (c === 46 && isDigit(next))) {
      let e = pos;
      if (c === 48 && (next === 120 || next === 88)) {
        e = pos + 2;
        while (e < n && isHexDigit(src.charCodeAt(e))) e++;
      } else {
        while (e < n && isDigit(src.charCodeAt(e))) e++;
        if (e < n && src.charCodeAt(e) === 46 && e + 1 < n && isDigit(src.charCodeAt(e + 1))) {
          e++;
          while (e < n && isDigit(src.charCodeAt(e))) e++;
        } else if (e < n && src.charCodeAt(e) === 46 && c !== 46) {
          // `1.` is a number unless it begins `1..` or `1.<`; leave `.` to the punctuator then.
          const after = e + 1 < n ? src.charCodeAt(e + 1) : -1;
          if (after !== 46 && after !== 60 && !isIdStart(after)) e++;
        } else if (c === 46) {
          e = pos + 1;
          while (e < n && isDigit(src.charCodeAt(e))) e++;
        }
        const ec = e < n ? src.charCodeAt(e) : -1;
        if (ec === 101 || ec === 69) {
          let k = e + 1;
          const sign = k < n ? src.charCodeAt(k) : -1;
          if (sign === 43 || sign === 45) k++;
          if (k < n && isDigit(src.charCodeAt(k))) {
            while (k < n && isDigit(src.charCodeAt(k))) k++;
            e = k;
          }
        }
      }
      push('num', start, e, startLine);
      continue;
    }

    // Strings
    if (c === 34 || c === 39) {
      let e = pos + 1;
      let closed = false;
      while (e < n) {
        const d = src.charCodeAt(e);
        if (d === 10) break;
        if (d === 92) {
          e += e + 1 < n && src.charCodeAt(e + 1) !== 10 ? 2 : 1;
          continue;
        }
        e++;
        if (d === c) {
          closed = true;
          break;
        }
      }
      push(closed ? 'str' : 'bad', start, e, startLine);
      continue;
    }

    // Regex literal
    if (c === 47 && regexAllowed()) {
      let e = pos + 1;
      let inClass = false;
      let closed = false;
      while (e < n) {
        const d = src.charCodeAt(e);
        if (d === 10) break;
        if (d === 92) {
          e += e + 1 < n && src.charCodeAt(e + 1) !== 10 ? 2 : 1;
          continue;
        }
        e++;
        if (d === 91) inClass = true;
        else if (d === 93) inClass = false;
        else if (d === 47 && !inClass) {
          closed = true;
          break;
        }
      }
      if (closed) {
        while (e < n && isIdPart(src.charCodeAt(e))) e++;
        push('regex', start, e, startLine);
      } else {
        push('bad', start, e, startLine);
      }
      continue;
    }

    // Punctuation, longest match
    let matched = 0;
    for (const p of PUNCT4) if (src.startsWith(p, pos)) matched = 4;
    if (!matched) for (const p of PUNCT3) if (src.startsWith(p, pos)) { matched = 3; break; }
    if (!matched) for (const p of PUNCT2) if (src.startsWith(p, pos)) { matched = 2; break; }
    if (!matched && PUNCT1.indexOf(src[pos]) >= 0) matched = 1;
    if (matched) {
      push('punct', start, pos + matched, startLine);
      continue;
    }

    // Anything else
    push('bad', start, pos + 1, startLine);
  }

  return tokens;
}
