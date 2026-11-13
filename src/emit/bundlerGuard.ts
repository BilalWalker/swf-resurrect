// Edge: imports 'vite' lazily. Reproduces the verdict of a `vite build` on one class file (breadth design 21.4, D29).
// `transformWithOxc` strips the TypeScript, then `parseAst(code, { lang: 'js', showSemanticErrors: true })` checks the result.
// No clock, no locale call, no randomness: two runs on the same text give the same check.
import type { BundlerCheckData, BundlerVerdict, SurvivingImport } from './classOmissions';

export type BundlerCheck = BundlerCheckData;

/** Thrown when Vite cannot be loaded or fails with something that is not a parse error (Requirement 26.7). */
export class BundlerGuardUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BundlerGuardUnavailable';
  }
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

const stripColours = (s: string): string => s.replace(ANSI, '');

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The first meaningful line of an error message, colour codes removed. */
function firstLine(message: string): string {
  const lines = stripColours(message)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !/^(Transform|Parse) failed with \d+ errors?:?$/.test(l));
  return lines[0] ?? 'unknown error';
}

function positionOf(code: string, offset: number): { line: number; column: number } {
  const upTo = code.slice(0, Math.max(0, Math.min(offset, code.length)));
  const line = upTo.split('\n').length;
  return { line, column: upTo.length - (upTo.lastIndexOf('\n') + 1) + 1 };
}

interface ViteApi {
  transformWithOxc(code: string, id: string, options?: object): Promise<{ code: string }>;
  parseAst(code: string, options?: { lang?: string; showSemanticErrors?: boolean }): AstNode;
}

interface AstNode {
  type: string;
  [key: string]: unknown;
}

async function loadVite(): Promise<ViteApi> {
  try {
    const vite = (await import('vite')) as unknown as Partial<ViteApi>;
    if (typeof vite.transformWithOxc !== 'function' || typeof vite.parseAst !== 'function') {
      throw new Error('vite does not export transformWithOxc and parseAst');
    }
    return vite as ViteApi;
  } catch (e) {
    throw new BundlerGuardUnavailable(`cannot load vite: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function nameOf(node: unknown): string | null {
  if (typeof node !== 'object' || node === null) return null;
  const n = node as { name?: unknown; value?: unknown };
  if (typeof n.name === 'string') return n.name;
  if (typeof n.value === 'string') return n.value;
  return null;
}

/** Imports and re-exports with a source, from the transformed program. Dynamic `import()` is ignored. */
function survivingImports(program: AstNode): SurvivingImport[] {
  const bySpecifier = new Map<string, Set<string>>();
  const body = (program.body as AstNode[] | undefined) ?? [];
  for (const node of body) {
    if (node.type !== 'ImportDeclaration' && node.type !== 'ExportNamedDeclaration' && node.type !== 'ExportAllDeclaration') continue;
    const source = node.source as { value?: unknown } | null | undefined;
    if (source === null || source === undefined || typeof source.value !== 'string') continue;
    const names = bySpecifier.get(source.value) ?? new Set<string>();
    bySpecifier.set(source.value, names);
    if (node.type === 'ExportAllDeclaration') {
      names.add('*');
      continue;
    }
    for (const spec of (node.specifiers as AstNode[] | undefined) ?? []) {
      if (spec.type === 'ImportDefaultSpecifier') names.add('default');
      else if (spec.type === 'ImportNamespaceSpecifier') names.add('*');
      else if (spec.type === 'ImportSpecifier') {
        const n = nameOf(spec.imported);
        if (n !== null) names.add(n);
      } else if (spec.type === 'ExportSpecifier') {
        const n = nameOf(spec.local);
        if (n !== null) names.add(n);
      }
    }
  }
  return [...bySpecifier.keys()].sort(cmp).map((specifier) => ({ specifier, names: [...bySpecifier.get(specifier)!].sort(cmp) }));
}

/** Runs the transform and the parse on one file. Rejects with `BundlerGuardUnavailable` when Vite fails for another reason. */
export async function checkClassFile(path: string, text: string): Promise<BundlerCheck> {
  const vite = await loadVite();
  let code: string;
  try {
    code = (await vite.transformWithOxc(text, path, {})).code;
  } catch (e) {
    const raw = messageOf(e);
    if (!/^Transform failed/.test(raw)) throw new BundlerGuardUnavailable(`vite transform failed unexpectedly: ${firstLine(raw)}`, { cause: e });
    const at = /\[ [^\]\n]*:(\d+):(\d+) \]/.exec(stripColours(raw));
    const verdict: BundlerVerdict = {
      ok: false,
      phase: 'transform',
      message: firstLine(raw),
      line: at === null ? 0 : Number(at[1]),
      column: at === null ? 0 : Number(at[2]),
    };
    return { verdict, imports: [] };
  }
  try {
    const program = vite.parseAst(code, { lang: 'js', showSemanticErrors: true });
    return { verdict: { ok: true }, imports: survivingImports(program) };
  } catch (e) {
    const raw = messageOf(e);
    if (!/^Parse failed/.test(raw)) throw new BundlerGuardUnavailable(`vite parse failed unexpectedly: ${firstLine(raw)}`, { cause: e });
    const pos = (e as { pos?: unknown }).pos;
    const { line, column } = typeof pos === 'number' ? positionOf(code, pos) : { line: 0, column: 0 };
    return {
      verdict: { ok: false, phase: 'parse', message: `${firstLine(raw)} (position in the transformed text)`, line, column },
      imports: [],
    };
  }
}

/** Checks every file; the map is keyed by the same paths and is built in sorted path order. */
export async function checkClassFiles(files: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, BundlerCheck>> {
  const out = new Map<string, BundlerCheck>();
  for (const path of [...files.keys()].sort(cmp)) out.set(path, await checkClassFile(path, files.get(path)!));
  return out;
}
