import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { DuplicateClassError } from '../../src/translate/errors';
import { keyScriptPaths, planTranslate } from '../../src/translate/planTranslate';
import { SHIM_AS3_NAMES, SHIM_MOVIECLIP_MEMBERS } from '../../src/translate/shimNames';
import { translate } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

const scene = (names: string[]): SceneJson => {
  const symbols: Record<string, unknown> = {};
  names.forEach((c, i) => {
    symbols[String(i)] = { type: 'sprite', frames: [], labels: {}, className: c };
  });
  return { formatVersion: 1, rootSymbolId: 0, symbols } as unknown as SceneJson;
};

const cls = (pkg: string, name: string, base?: string) =>
  `package ${pkg} {\n  public class ${name}${base ? ` extends ${base}` : ''} {\n  }\n}\n`;

describe('keyScriptPaths', () => {
  it('does not treat the same simple name in two packages as a duplicate', () => {
    const r = keyScriptPaths(['a/X.as', 'b/X.as', 'X.as']);
    expect(r.keyed.map((k) => k.qualified).sort()).toEqual(['X', 'a.X', 'b.X']);
  });

  it('throws DuplicateClassError for equal Qualified_Names', () => {
    const err = (() => {
      try {
        keyScriptPaths(['a/X.as', 'a/X.as']);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DuplicateClassError);
    expect((err as DuplicateClassError).className).toBe('a.X');
  });

  it('skips paths without a Qualified_Name, sorted', () => {
    const r = keyScriptPaths(['z.y.as', 'A.as', 'a.b/C.as', 'notes.txt']);
    expect(r.keyed.map((k) => k.qualified)).toEqual(['A']);
    expect(r.skipped).toEqual(['a.b/C.as', 'notes.txt', 'z.y.as']);
  });
});

describe('planTranslate with Qualified_Names', () => {
  it('keeps two classes with the same simple name', () => {
    const r = planTranslate(
      [
        { className: 'a.X', source: cls('a', 'X') },
        { className: 'b.X', source: cls('b', 'X') },
      ],
      scene(['a.X', 'b.X']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['a.X', 'b.X']);
    expect(r.classes.every((c) => c.diagnostics.length === 0)).toBe(true);
  });

  it('reports a package declaration that differs from the path', () => {
    const r = planTranslate([{ className: 'a.X', source: cls('b', 'X') }], scene(['a.X']), tsSyntaxCheck);
    expect(r.classes[0].diagnostics).toEqual([
      {
        kind: 'unsupported-construct',
        line: 1,
        message: 'package declaration "b.X" does not match the path; the path name "a.X" is used',
      },
    ]);
    expect(r.classes[0].className).toBe('a.X');
  });

  it('reports a class name that differs from the path', () => {
    const r = planTranslate([{ className: 'a.X', source: cls('a', 'Y') }], scene(['a.X']), tsSyntaxCheck);
    expect(r.classes[0].diagnostics.map((d) => d.message)).toEqual([
      'package declaration "a.Y" does not match the path; the path name "a.X" is used',
    ]);
  });

  it('adds no Diagnostic when declaration and path agree', () => {
    const r = planTranslate([{ className: 'X', source: cls('', 'X') }], scene(['X']), tsSyntaxCheck);
    expect(r.classes[0].diagnostics).toEqual([]);
  });

  it('carries skipped scripts sorted', () => {
    const r = planTranslate([], scene([]), tsSyntaxCheck, ['b.as', 'a.as']);
    expect(r.skippedScripts).toEqual(['a.as', 'b.as']);
  });
});

const tr = (source: string, self: string, known: string[]) =>
  translate(source, {
    shimNames: SHIM_AS3_NAMES,
    shimMembers: SHIM_MOVIECLIP_MEMBERS,
    selfQualified: self,
    siblingClasses: new Set(known),
    syntaxCheck: tsSyntaxCheck,
  });
const src = (pkg: string, header: string, body: string) => `package ${pkg} {\n${header}\n  public class ${body}\n}\n`;

describe('import lines from the import plan', () => {
  it('writes an explicit import, a same-package import and a wildcard import with relative specifiers', () => {
    const source = src(
      'app',
      '  import lib.util.Helper;\n  import lib.core.*;',
      'Main extends Base {\n    public function f():void { var a:Helper = new Helper(); var b:Core = new Core(); var c:Peer = null; }\n  }',
    );
    const r = tr(source, 'app.Main', ['app.Base', 'app.Peer', 'lib.util.Helper', 'lib.core.Core']);
    expect(r.text.split('\n').slice(0, 5)).toEqual([
      "import { Core } from '../lib/core/Core';",
      "import { Helper } from '../lib/util/Helper';",
      "import { Base } from './Base';",
      "import { Peer } from './Peer';",
      '',
    ]);
    expect(r.importRecords.map((x) => [x.line, x.kind, x.target])).toEqual([
      [1, 'class', 'lib.core.Core'],
      [2, 'class', 'lib.util.Helper'],
      [3, 'class', 'app.Base'],
      [4, 'class', 'app.Peer'],
    ]);
    expect(r.classes[0].extendsQualified).toBe('app.Base');
    expect(r.classes[0].extendsName).toBe('Base');
  });

  it('writes the Shim line first with a specifier that follows the depth', () => {
    const source = src('a.b', '', 'X extends Sprite {\n    public function f():void { trace(new Y()); }\n  }');
    const r = tr(source, 'a.b.X', ['a.b.Y']);
    expect(r.text.startsWith("import { Sprite, trace } from '../../../shim';\nimport { Y } from './Y';\n")).toBe(true);
    expect(r.importRecords[0]).toEqual({ line: 1, kind: 'shim', names: [{ name: 'Sprite' }, { name: 'trace' }] });
    expect(r.classes[0].extendsQualified).toBeNull();
    const flat = tr('package {\n  public class X extends Sprite {}\n}\n', 'X', []);
    expect(flat.text.startsWith("import { Sprite } from '../shim';\n")).toBe(true);
  });

  it('does not import from the Shim a name that a class binds', () => {
    const source = src('a', '', 'X {\n    public function f():void { var s:Sprite; }\n  }');
    const r = tr(source, 'a.X', ['a.Sprite']);
    expect(r.text).toContain("import { Sprite } from './Sprite';");
    expect(r.text).not.toContain('shim');
  });

  it('rewrites a dotted expression and an extends name to the binding', () => {
    const source = src('app', '', 'Main extends lib.util.Base {\n    public function f():void { var h:* = new lib.util.Helper(); }\n  }');
    const r = tr(source, 'app.Main', ['lib.util.Base', 'lib.util.Helper']);
    expect(r.text).toContain('export class Main extends Base {');
    expect(r.text).toContain('new Helper()');
    expect(r.text).toContain("import { Base } from '../lib/util/Base';");
    expect(r.classes[0].extendsName).toBe('lib.util.Base');
    expect(r.classes[0].extendsQualified).toBe('lib.util.Base');
  });

  it('aliases the second class with the same simple name', () => {
    const source = src('app', '  import b.X;', 'Main {\n    public function f():void { var p:X; var q:* = new a.X(); }\n  }');
    const r = tr(source, 'app.Main', ['a.X', 'b.X']);
    expect(r.text).toContain("import { X as a_X } from '../a/X';");
    expect(r.text).toContain("import { X } from '../b/X';");
    expect(r.text).toContain('new a_X()');
    expect(r.importRecords.find((x) => x.target === 'a.X')?.names).toEqual([{ name: 'X', alias: 'a_X' }]);
  });

  it('reports an ambiguous wildcard name and imports neither class', () => {
    const source = src('app', '  import a.*;\n  import b.*;', 'Main {\n    public function f():void { var p:X; }\n  }');
    const r = tr(source, 'app.Main', ['a.X', 'b.X']);
    expect(r.importRecords).toEqual([]);
    expect(r.diagnostics.map((d) => d.message)).toEqual(['"X" is ambiguous between a.X and b.X; neither is imported']);
  });

  it('drops a flash.* import and leaves an unresolved name unbound', () => {
    const source = src('app', '  import flash.display.Sprite;\n  import flash.utils.Timer;', 'Main extends Sprite {\n    public function f():void { var t:Timer; }\n  }');
    const r = tr(source, 'app.Main', []);
    expect(r.text).toContain("import { Sprite } from '../../shim';");
    expect(r.text).not.toContain('import { Timer');
    expect(r.importRecords.filter((x) => x.kind === 'class')).toEqual([]);
  });
});

describe('planTranslate closure over imports', () => {
  it('keeps a class that is only imported, transitively', () => {
    const r = planTranslate(
      [
        { className: 'app.Main', source: src('app', '  import lib.A;', 'Main {\n    public function f():void { new A(); }\n  }') },
        { className: 'lib.A', source: src('lib', '  import lib.deep.B;', 'A {\n    public function f():void { new B(); }\n  }') },
        { className: 'lib.deep.B', source: src('lib.deep', '', 'B {}') },
        { className: 'lib.Unused', source: src('lib', '', 'Unused {}') },
      ],
      scene(['app.Main']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['app.Main', 'lib.A', 'lib.deep.B']);
    expect(r.classes[0].importRecords.map((x) => x.target)).toEqual(['lib.A']);
  });

  it('follows extendsQualified across packages', () => {
    const r = planTranslate(
      [
        { className: 'app.Main', source: src('app', '  import lib.Base;', 'Main extends Base {}') },
        { className: 'lib.Base', source: src('lib', '', 'Base {}') },
      ],
      scene(['app.Main']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['app.Main', 'lib.Base']);
    expect(r.classes[0].extendsQualified).toBe('lib.Base');
  });
});
