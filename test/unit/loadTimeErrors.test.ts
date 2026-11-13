// Requirement 23.1 (f), design 19.2 and 21.4, D41: a gate error in code that runs when the module is
// evaluated omits the class (`load-time-error`); the same error in code that runs later leaves it loose.
// One real gate run over a project of small classes, then the Core decision on its result.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { decideClassOmissions, looseClasses, omissionMessage, type OmissionClass } from '../../src/emit/classOmissions';
import { buildReport } from '../../src/translate/report';
import { typeCheckProject, type GateResult } from '../../src/translate/typeCheckGate';

vi.setConfig({ testTimeout: 120_000 });

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function readTree(dir: string, prefix = ''): [string, string][] {
  const out: [string, string][] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTree(full, `${prefix}${name}/`));
    else if (name !== '.gitkeep') out.push([`${prefix}${name}`, readFileSync(full, 'utf8').replace(/\r\n/g, '\n')]);
  }
  return out;
}

const HEAD = "import { MovieClip } from '../shim';\n";
const CLASSES: Record<string, string> = {
  StaticUnknown: `${HEAD}export class StaticUnknown extends MovieClip {\n  static f: any = new TextFormat('_sans');\n}\n`,
  StaticMember: `${HEAD}export class StaticMember extends MovieClip {\n  static g: any = MovieClip.nope();\n}\n`,
  StaticBlock: `${HEAD}export class StaticBlock extends MovieClip {\n  static {\n    new Gone();\n  }\n}\n`,
  TopLevel: `${HEAD}const x: any = new Nope();\nexport class TopLevel extends MovieClip {}\n`,
  BadExtends: `${HEAD}export class BadExtends extends Nope {}\n`,
  InMethod: `${HEAD}export class InMethod extends MovieClip {\n  public m(): any {\n    return new Nope();\n  }\n}\n`,
  InCtor: `${HEAD}export class InCtor extends MovieClip {\n  constructor() {\n    super();\n    new Nope();\n  }\n}\n`,
  InInstanceInit: `${HEAD}export class InInstanceInit extends MovieClip {\n  public f: any = new Nope();\n}\n`,
  InAccessor: `${HEAD}export class InAccessor extends MovieClip {\n  public get a(): any {\n    return new Nope();\n  }\n}\n`,
  StaticArrow: `${HEAD}export class StaticArrow extends MovieClip {\n  static f: any = () => new Nope();\n}\n`,
  Clean: `${HEAD}export class Clean extends MovieClip {\n  static k: number = 1;\n}\n`,
  Child: `import { StaticUnknown } from './StaticUnknown';\nexport class Child extends StaticUnknown {}\n`,
  GrandChild: `import { Child } from './Child';\nexport class GrandChild extends Child {}\n`,
  Importer: `import { StaticUnknown } from './StaticUnknown';\nexport class Importer {\n  public s: any = StaticUnknown;\n}\n`,
};

interface Fixture {
  gate: GateResult;
  classes: OmissionClass[];
}

let cached: Fixture | undefined;
function fixture(): Fixture {
  if (cached !== undefined) return cached;
  const files = new Map(readTree(join(repoRoot, 'template')));
  for (const [name, text] of Object.entries(CLASSES)) files.set(`src/${name}.ts`, text);
  const gate = typeCheckProject({ files, repoRoot });
  const classes: OmissionClass[] = Object.keys(CLASSES).map((name) => ({
    className: name,
    path: `src/${name}.ts`,
    extendsQualified: name === 'Child' ? 'StaticUnknown' : name === 'GrandChild' ? 'Child' : null,
    importsQualified: name === 'Importer' ? ['StaticUnknown'] : [],
    handwritten: false,
    produced: true,
    ...(gate.moduleEval?.[`src/${name}.ts`] === undefined ? {} : { moduleEval: gate.moduleEval[`src/${name}.ts`] }),
  }));
  cached = { gate, classes };
  return cached;
}

function reasonOf(name: string): unknown {
  const { gate, classes } = fixture();
  return decideClassOmissions(gate.errors, classes, []).find((o) => o.className === name)?.reason;
}

describe('load-time-error', () => {
  it('omits a class whose static initialiser uses an unknown name (TS2304, the name)', () => {
    expect(reasonOf('StaticUnknown')).toEqual({ kind: 'load-time-error', code: 2304, line: 3, name: 'TextFormat' });
  });

  it('omits a class whose static initialiser calls a missing member of a Shim class (TS2339, Type.member)', () => {
    expect(reasonOf('StaticMember')).toMatchObject({ kind: 'load-time-error', code: 2339, name: 'MovieClip.nope' });
  });

  it('omits a class with an error in a static block', () => {
    expect(reasonOf('StaticBlock')).toMatchObject({ kind: 'load-time-error', code: 2304, name: 'Gone' });
  });

  it('omits a class with an error in a top-level statement', () => {
    expect(reasonOf('TopLevel')).toMatchObject({ kind: 'load-time-error', code: 2304, line: 2, name: 'Nope' });
  });

  it('omits a class with an error in its extends clause', () => {
    expect(reasonOf('BadExtends')).toMatchObject({ kind: 'load-time-error', code: 2304, line: 2, name: 'Nope' });
  });

  it('keeps a class loose when the same error is in a method, constructor, accessor, instance initialiser or static arrow body', () => {
    const { gate, classes } = fixture();
    const omitted = decideClassOmissions(gate.errors, classes, []);
    const loose = looseClasses(gate.errors, classes, omitted).map((l) => l.className);
    for (const n of ['InMethod', 'InCtor', 'InInstanceInit', 'InAccessor', 'StaticArrow']) {
      expect(gate.errors.some((e) => e.file === `src/${n}.ts`), `${n} has a gate error`).toBe(true);
      expect(omitted.some((o) => o.className === n), `${n} is not omitted`).toBe(false);
      expect(loose).toContain(n);
    }
    expect(omitted.some((o) => o.className === 'Clean')).toBe(false);
  });

  it('omits dependants to a fixed point, naming the direct cause', () => {
    expect(reasonOf('Child')).toEqual({ kind: 'extends-omitted', base: 'StaticUnknown' });
    expect(reasonOf('GrandChild')).toEqual({ kind: 'extends-omitted', base: 'Child' });
    expect(reasonOf('Importer')).toEqual({ kind: 'imports-omitted', imported: 'StaticUnknown' });
  });

  it('does not run without ranges, and ignores syntactic errors and handwritten classes', () => {
    const { gate, classes } = fixture();
    const bare = classes.map(({ moduleEval: _m, ...rest }) => rest as OmissionClass);
    expect(decideClassOmissions(gate.errors, bare, []).map((o) => o.className)).toEqual([]);
    const hw = classes.map((c) => ({ ...c, handwritten: true }));
    expect(decideClassOmissions(gate.errors, hw, [])).toEqual([]);
    const syntactic = gate.errors.map((e) => ({ ...e, syntactic: true }));
    expect(decideClassOmissions(syntactic, classes.map((c) => ({ ...c, bundler: { verdict: { ok: true as const }, imports: [] } })), [])).toEqual([]);
  });

  it('applies with a passing Bundler_Check too', () => {
    const { gate, classes } = fixture();
    const checked = classes.map((c) => ({ ...c, bundler: { verdict: { ok: true as const }, imports: [] } }));
    const names = decideClassOmissions(gate.errors, checked, []).map((o) => o.className);
    expect(names).toEqual(decideClassOmissions(gate.errors, classes, []).map((o) => o.className));
    expect(names).toContain('StaticUnknown');
  });

  it('reports the reason, the code and the exact name in the message and the Translation_Report', () => {
    const { gate, classes } = fixture();
    const omissions = decideClassOmissions(gate.errors, classes, [{ symbolId: 4, className: 'StaticUnknown' }]);
    const o = omissions.find((x) => x.className === 'StaticUnknown')!;
    expect(omissionMessage(o)).toBe(
      "class StaticUnknown is left out of the registry: TS2304 at line 3 in code that runs when the module loads: TextFormat; symbol 4 becomes plain MovieClip",
    );
    const report = buildReport(
      classes.map((c) => ({ className: c.className, overridden: false, path: c.path, diagnostics: [] })),
      gate,
      { omissions, loose: looseClasses(gate.errors, classes, omissions) },
    );
    const entry = report.omittedClasses.find((x) => x.className === 'StaticUnknown')!;
    expect(entry.reason).toEqual({ kind: 'load-time-error', code: 2304, line: 3, name: 'TextFormat' });
    const cls = report.classes.find((x) => x.className === 'StaticUnknown')!;
    expect(cls.omitted).toBe(true);
    expect(cls.diagnostics.find((d) => d.kind === 'class-omitted')).toMatchObject({ line: 3 });
    expect(cls.diagnostics.find((d) => d.kind === 'class-omitted')!.message).toContain('TextFormat');
    expect(report.classes.find((x) => x.className === 'InMethod')).toMatchObject({ omitted: false, loose: true });
  });
});
