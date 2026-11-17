import { SHIM_AS3_NAMES } from '../../src/translate/shimNames';
import { translateCore } from '../../src/translate/translate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { evalTranslated } from './evalTranslated';

// Fixture_Classes for the super-argument tests (Requirement 19).
const BASE = 'package\n{\n  public class Base\n  {\n    public var got:*;\n    public function Base(v:*)\n    {\n      got = v;\n    }\n  }\n}\n';

export function build(members: string, ctor: string): { text: string; diagnostics: { kind: string; message: string }[] } {
  const src = `package\n{\n  public class A extends Base\n  {\n${members}\n    public function A()\n    {\n${ctor}\n    }\n  }\n}\n`;
  return translateCore(src, {
    shimNames: SHIM_AS3_NAMES,
    selfQualified: 'A',
    siblingClasses: new Set(['A', 'Base']),
    syntaxCheck: tsSyntaxCheck,
  });
}

export function construct(text: string): { a: any } {
  const base = translateCore(BASE, {
    shimNames: SHIM_AS3_NAMES,
    selfQualified: 'Base',
    siblingClasses: new Set(['A', 'Base']),
    syntaxCheck: tsSyntaxCheck,
  }).text;
  const { Base } = evalTranslated(base);
  const { A } = evalTranslated(text, { './Base': { Base } });
  return { a: new A() };
}

