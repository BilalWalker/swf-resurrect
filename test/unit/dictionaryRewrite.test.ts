// Dictionary index syntax on a typed receiver (as3-coverage task 14.2, Requirements 11.4, 13.2, 13.6). Fixture_Classes only.
// Validates: Requirements 11.4, 13.2, 13.6
import { describe, expect, it } from 'vitest';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { fixtureTables } from '../support/tables';

function run(body: string): { text: string; messages: string[] } {
  const src =
    'package\n{\n  import flash.utils.Dictionary;\n  public class DictFix\n  {\n' + body + '\n  }\n}\n';
  const out = translateCore(src, {
    shimNames: SHIM_AS3_NAMES,
    tables: fixtureTables('test/fixtures/clickgoto', [['DictFix', src]]),
    selfQualified: 'DictFix',
    siblingClasses: new Set(['DictFix']),
    syntaxCheck: tsSyntaxCheck,
  });
  return { text: out.text, messages: out.diagnostics.map((d) => d.message) };
}

describe('Dictionary index rewrite', () => {
  it('rewrites a field receiver: read, write, in, delete', () => {
    const { text } = run(
      '    private var table:Dictionary = new Dictionary();\n' +
        '    public function go(k:Object) : *\n    {\n' +
        '      table[k] = 5;\n      var has:Boolean = k in table;\n      delete table[k];\n      return table[k];\n    }',
    );
    expect(text).toContain('this.table.set(k, 5)');
    expect(text).toContain('this.table.has(k)');
    expect(text).toContain('this.table.delete(k)');
    expect(text).toContain('return this.table.get(k)');
    expect(text).not.toContain('table[');
  });

  it('rewrites a parameter receiver and a compound assignment', () => {
    const { text } = run(
      '    public function go(d:Dictionary, k:Function) : void\n    {\n      d[k] = 1;\n      d[k] += 2;\n    }',
    );
    expect(text).toContain('d.set(k, 1)');
    expect(text).toContain('d.set(k, d.get(k) + (2))');
  });

  it('rewrites a local receiver', () => {
    const { text } = run(
      '    public function go(k:Object) : *\n    {\n      var d:Dictionary = new Dictionary();\n      d[k] = k;\n      return d[k];\n    }',
    );
    expect(text).toContain('d.set(k, k)');
    expect(text).toContain('return d.get(k)');
  });

  it('leaves the index syntax and names the site when the type is not known', () => {
    const { text, messages } = run(
      '    private var table:Dictionary = new Dictionary();\n' +
        '    public function go(o:*, k:String) : *\n    {\n      return o[k];\n    }',
    );
    expect(text).toContain('o[k]');
    expect(messages.some((m) => m.includes('Dictionary index') && m.includes('"o"'))).toBe(true);
  });

  it('does not touch an Array receiver', () => {
    const { text, messages } = run(
      '    private var table:Dictionary = new Dictionary();\n' +
        '    public function go(a:Array) : *\n    {\n      a[0] = 1;\n      return a[0];\n    }',
    );
    expect(text).toContain('a[0] = 1');
    expect(messages.filter((m) => m.includes('Dictionary index'))).toEqual([]);
  });
});
