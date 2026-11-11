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
}
export interface GateResult {
  errors: GateError[];
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
  try {
    const program = ts.createProgram({ rootNames, options, host });
    diagnostics = ts.getPreEmitDiagnostics(program);
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
  return { errors };
}
