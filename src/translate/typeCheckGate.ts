import ts from 'typescript-js';
import { PipelineError } from '../pipeline/errors';

export interface GateInput {
  /** The whole Emitted_Project: posix relative path -> text. */
  files: ReadonlyMap<string, string>;
  /** Where node_modules/pixi.js is found. */
  repoRoot: string;
}
export interface GateError {
  file: string;
  line: number;
  column: number;
  code: number;
  message: string;
  /** true when the diagnostic is one of program.getSyntacticDiagnostics() (parser and scanner). Never derived from the code. */
  syntactic: boolean;
  /** For code 2307 or 2792: the module specifier as written, quotes removed, read from the source text at the span. Else null. */
  specifier: string | null;
}
/** A stretch of an emitted file, 1-based line and column; the end is exclusive. */
export interface EvalRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface GateResult {
  errors: GateError[];
  /**
   * Per emitted file (same path as `GateError.file`): the stretches that run when the module is evaluated
   * (design 19.2, Requirement 23.1 (f)). Only files that have a stretch are listed. Absent: not computed.
   */
  moduleEval?: Record<string, EvalRange[]>;
}

/** The gate itself failed (not the project): bad tsconfig, unreadable input. */
export class TypeCheckGateError extends PipelineError {
  readonly stage = 'pipeline' as const;
  readonly code = 'TYPECHECK_GATE';
  constructor(detail: string) {
    super(`type-check gate failed: ${detail}`);
  }
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type Span = readonly [start: number, end: number];

function hasModifier(n: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind);
}

function isFunctionLikeNode(n: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n) ||
    ts.isConstructorDeclaration(n)
  );
}

/** `span` minus the (sorted, possibly overlapping) `holes`. */
function subtractSpans(span: Span, holes: readonly Span[]): Span[] {
  const out: Span[] = [];
  let at = span[0];
  for (const [hs, he] of [...holes].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (he <= at) continue;
    if (hs >= span[1]) break;
    if (hs > at) out.push([at, hs]);
    at = Math.max(at, he);
  }
  if (at < span[1]) out.push([at, span[1]]);
  return out;
}

/**
 * The stretches of one emitted file that run when its module is evaluated (Requirement 23.1 (f), design
 * 19.2): heritage expressions, decorators, computed member names, static property initialisers, static
 * blocks and top-level statements, each without function bodies, class member bodies and type nodes.
 * A pure function of the syntax tree: no clock, no locale call; ranges are sorted by start.
 */
export function moduleEvaluationRanges(sf: ts.SourceFile): EvalRange[] {
  const spans: Span[] = [];
  const spanOf = (n: ts.Node): Span => [n.getStart(sf), n.end];
  const addEval = (node: ts.Node): void => {
    if (isFunctionLikeNode(node)) return;
    if (ts.isClassLike(node)) {
      addClass(node);
      return;
    }
    const holes: Span[] = [];
    const walk = (parent: ts.Node): void => {
      ts.forEachChild(parent, (child) => {
        if (isFunctionLikeNode(child)) holes.push(spanOf(child));
        else if (ts.isClassLike(child)) {
          holes.push(spanOf(child));
          addClass(child);
        } else if (ts.isTypeNode(child) && !ts.isExpressionWithTypeArguments(child)) holes.push(spanOf(child));
        else walk(child);
      });
    };
    walk(node);
    spans.push(...subtractSpans(spanOf(node), holes));
  };
  const addClass = (cls: ts.ClassLikeDeclaration): void => {
    for (const d of ts.getDecorators(cls) ?? []) addEval(d);
    for (const h of cls.heritageClauses ?? []) for (const t of h.types) addEval(t.expression);
    for (const m of cls.members) {
      for (const d of (ts.canHaveDecorators(m) ? ts.getDecorators(m) : undefined) ?? []) addEval(d);
      if (m.name !== undefined && ts.isComputedPropertyName(m.name)) addEval(m.name.expression);
      if (ts.isClassStaticBlockDeclaration(m)) addEval(m.body);
      else if (ts.isPropertyDeclaration(m) && hasModifier(m, ts.SyntaxKind.StaticKeyword) && m.initializer !== undefined) addEval(m.initializer);
    }
  };
  for (const stmt of sf.statements) {
    if (
      ts.isImportDeclaration(stmt) ||
      (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier !== undefined) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isFunctionDeclaration(stmt) ||
      hasModifier(stmt, ts.SyntaxKind.DeclareKeyword)
    ) {
      continue;
    }
    addEval(stmt);
  }
  return spans
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([s, e]) => {
      const a = sf.getLineAndCharacterOfPosition(s);
      const b = sf.getLineAndCharacterOfPosition(e);
      return { line: a.line + 1, column: a.character + 1, endLine: b.line + 1, endColumn: b.character + 1 };
    });
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Type-checks an Emitted_Project in process. The project is mounted at the
 * virtual directory `<repoRoot>/__gate__/`, so module resolution walks up to
 * `<repoRoot>/node_modules` and finds the installed `pixi.js`. No install, no
 * child process.
 */
export function typeCheckProject(input: GateInput): GateResult {
  const repoRoot = toPosix(input.repoRoot).replace(/\/+$/, '');
  const root = `${repoRoot}/__gate__`;
  const prefix = `${root}/`;

  const virtualFiles = new Map<string, string>();
  const virtualDirs = new Set<string>([root]);
  for (const [rel, text] of input.files) {
    const abs = prefix + toPosix(rel);
    virtualFiles.set(abs, text);
    let dir = abs.slice(0, abs.lastIndexOf('/'));
    while (dir.length >= root.length && !virtualDirs.has(dir)) {
      virtualDirs.add(dir);
      dir = dir.slice(0, dir.lastIndexOf('/'));
    }
  }
  const isVirtual = (p: string): boolean => p === root || p.startsWith(prefix);

  // Options from the emitted tsconfig.json.
  const tsconfigText = input.files.get('tsconfig.json');
  if (tsconfigText === undefined) throw new TypeCheckGateError('tsconfig.json is missing from the project');
  const parsed = ts.parseConfigFileTextToJson('tsconfig.json', tsconfigText);
  if (parsed.error !== undefined) {
    throw new TypeCheckGateError(ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'));
  }
  const json = parsed.config as { compilerOptions?: Record<string, unknown>; include?: string[] };
  const converted = ts.convertCompilerOptionsFromJson(json.compilerOptions ?? {}, root, 'tsconfig.json');
  if (converted.errors.length > 0) {
    throw new TypeCheckGateError(
      converted.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('; '),
    );
  }
  const options: ts.CompilerOptions = { ...converted.options, noEmit: true };

  // Roots: .ts files under the include directories.
  const includeDirs = (json.include ?? []).map((d) => toPosix(d).replace(/\/+$/, ''));
  const rootNames = [...virtualFiles.keys()]
    .filter((abs) => {
      if (!abs.endsWith('.ts') || abs.endsWith('.d.ts')) return false;
      const rel = abs.slice(prefix.length);
      return includeDirs.some((d) => rel.startsWith(d + '/'));
    })
    .sort(byCodeUnit);

  const base = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...base,
    getCurrentDirectory: () => root,
    fileExists: (f) => {
      const p = toPosix(f);
      return isVirtual(p) ? virtualFiles.has(p) : base.fileExists(f);
    },
    readFile: (f) => {
      const p = toPosix(f);
      return isVirtual(p) ? virtualFiles.get(p) : base.readFile(f);
    },
    directoryExists: (d) => {
      const p = toPosix(d).replace(/\/+$/, '');
      return isVirtual(p) ? virtualDirs.has(p) : (base.directoryExists?.(d) ?? false);
    },
    getDirectories: (d) => {
      const p = toPosix(d).replace(/\/+$/, '');
      if (!isVirtual(p)) return base.getDirectories?.(d) ?? [];
      const childPrefix = p + '/';
      const names = new Set<string>();
      for (const dir of virtualDirs) {
        if (dir.startsWith(childPrefix) && !dir.slice(childPrefix.length).includes('/')) {
          names.add(dir.slice(childPrefix.length));
        }
      }
      return [...names].sort(byCodeUnit);
    },
    realpath: (f) => (isVirtual(toPosix(f)) ? f : (base.realpath?.(f) ?? f)),
    getSourceFile: (fileName, languageVersionOrOptions, onError, shouldCreate) => {
      const p = toPosix(fileName);
      if (isVirtual(p)) {
        const text = virtualFiles.get(p);
        return text === undefined ? undefined : ts.createSourceFile(p, text, languageVersionOrOptions, true);
      }
      return base.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate);
    },
    writeFile: () => {},
  };

  let diagnostics: readonly ts.Diagnostic[];
  const moduleEval: Record<string, EvalRange[]> = {};
  const syntacticKeys = new Set<string>();
  const keyOf = (d: ts.Diagnostic): string => `${d.file?.fileName ?? ''}:${d.start ?? -1}:${d.code}`;
  try {
    const program = ts.createProgram({ rootNames, options, host });
    diagnostics = ts.getPreEmitDiagnostics(program);
    for (const d of program.getSyntacticDiagnostics()) syntacticKeys.add(keyOf(d));
    for (const abs of rootNames) {
      const sf = program.getSourceFile(abs);
      const ranges = sf === undefined ? [] : moduleEvaluationRanges(sf);
      if (ranges.length > 0) moduleEval[abs.slice(prefix.length)] = ranges;
    }
  } catch (e) {
    throw new TypeCheckGateError(e instanceof Error ? e.message : String(e));
  }

  const scrub = (s: string): string => toPosix(s).split(prefix).join('<out>/').split(repoRoot).join('<repo>');
  const errors: GateError[] = [];
  for (const d of diagnostics) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;
    let file = '';
    let line = 0;
    let column = 0;
    if (d.file !== undefined) {
      const name = toPosix(d.file.fileName);
      file = name.startsWith(prefix) ? name.slice(prefix.length) : scrub(name);
      if (d.start !== undefined) {
        const lc = d.file.getLineAndCharacterOfPosition(d.start);
        line = lc.line + 1;
        column = lc.character + 1;
      }
    }
    errors.push({
      file,
      line,
      column,
      code: d.code,
      message: scrub(ts.flattenDiagnosticMessageText(d.messageText, '\n')),
      syntactic: syntacticKeys.has(keyOf(d)),
      specifier:
        (d.code === 2307 || d.code === 2792) && d.file !== undefined && d.start !== undefined && d.length !== undefined
          ? d.file.text.slice(d.start, d.start + d.length).replace(/^['"]|['"]$/g, '')
          : null,
    });
  }
  errors.sort(
    (a, b) =>
      byCodeUnit(a.file, b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      a.code - b.code ||
      byCodeUnit(a.message, b.message),
  );
  return { errors, moduleEval };
}
