import { describe, expect, it } from 'vitest';
import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { build, construct } from '../support/superArgsFixture';

// Requirement 19, D14: a field read in the arguments of super(...) is hoisted into a local.

describe('super(...) arguments that read a field (Requirement 19)', () => {
  it('hoists an initialised field read as this.x and assigns it after super', () => {
    const r = build('    public var x:Object = {};', '      super(this.x);');
    expect(r.text).toContain('const __super_x: any = {};');
    expect(r.text).toContain('super(__super_x);');
    expect(r.text).toContain('this.x = __super_x;');
    expect(r.text).toContain('public x: any;');
    const { a } = construct(r.text);
    expect(a.got).toBe(a.x);
    expect(r.diagnostics.some((d) => d.kind === 'super-argument-field' && d.message.includes('"x"'))).toBe(true);
  });

  it('hoists a bare field name', () => {
    const r = build('    public var n:int = 7;', '      super(n);');
    expect(r.text).toContain('super(__super_n);');
    const { a } = construct(r.text);
    expect(a.got).toBe(7);
    expect(a.n).toBe(7);
  });

  it('passes the type default for a field without initialiser', () => {
    const r = build('    public var n:int;', '      super(this.n);');
    expect(r.text).toContain('const __super_n: number = 0;');
    const { a } = construct(r.text);
    expect(a.got).toBe(0);
    expect(r.diagnostics.find((d) => d.kind === 'super-argument-field')!.message).not.toContain('limit');
  });

  it('records a limit when the body assigns a field without initialiser', () => {
    const r = build('    public var n:int;', '      super(n);\n      n = 5;');
    expect(r.diagnostics.find((d) => d.kind === 'super-argument-field')!.message).toContain('limit');
    const { a } = construct(r.text);
    expect(a.n).toBe(5);
    expect(a.got).toBe(0);
  });

  it('leaves a super call alone when a constructor parameter shadows the name', () => {
    const src = 'package\n{\n  public class A extends Base\n  {\n    public var n:int = 1;\n    public function A(n:int)\n    {\n      super(n);\n    }\n  }\n}\n';
    const r = translateCore(src, { shimNames: SHIM_AS3_NAMES, selfQualified: 'A', siblingClasses: new Set(['A', 'Base']), syntaxCheck: tsSyntaxCheck });
    expect(r.text).not.toContain('__super_');
  });
});
