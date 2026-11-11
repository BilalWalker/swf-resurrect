import { describe, expect, it } from 'vitest';
import { scan, splitAngleTokens } from '../../src/translate/scanner';
import { emitFromSource } from '../../src/translate/emitTs';
import { tokenize } from '../../src/translate/tokenizer';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

const wrap = (body: string): string =>
  `package\n{\n  public class A\n  {\n    public function A()\n    {\n${body}\n    }\n  }\n}\n`;

describe('scanner and emitTs', () => {
  it('emits a parseable class and keeps ; inside nested groups', () => {
    const out = emitFromSource(wrap('      var o:* = {a: 1, b: [2, 3]};\n      if(o) trace("x;y");'));
    expect(out.diagnostics).toEqual([]);
    expect(out.text).toContain('if (o) {');
    expect(tsSyntaxCheck(out.text)).toEqual([]);
  });

  it('keeps try/catch/finally as one unsupported span', () => {
    const out = emitFromSource(wrap('      try\n      {\n        a();\n      }\n      catch(e:Error)\n      {\n      }\n      finally\n      {\n      }\n      b();'));
    const unsupported = out.diagnostics.filter((d) => d.kind === 'unsupported-construct');
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0].line).toBe(7);
    expect(out.text).toContain('// AS3: try');
    expect(out.text).toContain('b();');
    expect(tsSyntaxCheck(out.text)).toEqual([]);
  });

  it('reports an unclosed brace as unsupported to end of file', () => {
    const out = emitFromSource('package\n{\n  public class A\n  {\n    var x;\n');
    expect(out.diagnostics).toHaveLength(1);
    expect(out.text.startsWith('// AS3:')).toBe(true);
  });

  it('gives two statements on one line separate nodes without duplicating text', () => {
    const out = emitFromSource(wrap('      a(); try { b(); } catch(e) {}'));
    expect(out.text.split('a()').length).toBe(2);
    expect(out.diagnostics).toHaveLength(1);
  });

  it('emits blank input as empty text', () => {
    expect(emitFromSource('  \n\n').text).toBe('');
  });

  it('splits >> in nested generics and scans the type', () => {
    const src = 'package { public class A { public var v:Vector.<Vector.<int>>; } }';
    const split = splitAngleTokens(tokenize(src)).filter((t) => t.text === '>');
    expect(split).toHaveLength(2);
    const { nodes } = scan(tokenize(src));
    expect(nodes[0].kind).toBe('package');
    const out = emitFromSource(src);
    expect(out.diagnostics).toEqual([]);
  });
});
