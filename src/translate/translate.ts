// Transpiler entry points (design 1). Pure: no node:* imports, no regular
// expressions, no Date, no Math.random, no localeCompare.
//
// `translateCore` wires tokenizer, scanner, rewrite and emitTs, and installs the
// constructor hook (design 1.6) and method binding (design 1.7). `translate` adds
// the injected syntax check and the D5 fallback.

import { canonicalClassPath } from '../convert/qualifiedName';
import { emitTs, escapeComment } from './emitTs';
import type { BodyItem, EmitHooks } from './emitTs';
import { planFileImports } from './importPlan';
import type { ImportPlanInput } from './importPlan';
import { buildMemberTables, orderByDeclaration } from './memberTables';
import { SHIM_MEMBER_TABLE } from './shimMembers.generated';
import type { ImportPlan } from './importPlan';
import { collectReferences, createImportLines, createRewriter } from './rewrite';
import { scan } from './scanner';
import type { ClassNode, InterfaceNode, MethodNode, Node } from './scanner';
import { normalizeNewlines, tokenize } from './tokenizer';
import type { Token } from './tokenizer';
import type { ClassInfo, TranslateOptions, TranslateResult } from './types';

/** True when `node` is the expression statement `super(...)`. */
function isSuperCall(tokens: readonly Token[], node: Node): boolean {
  if (node.kind !== 'statement' || node.stmt !== 'expr' || node.expr === null) return false;
  let i = node.expr.from;
  while (i < node.expr.to && tokens[i].kind === 'comment') i++;
  const a = tokens[i];
  if (a === undefined || a.kind !== 'id' || a.text !== 'super') return false;
  i++;
  while (i < node.expr.to && tokens[i].kind === 'comment') i++;
  const b = tokens[i];
  return b !== undefined && b.kind === 'punct' && b.text === '(';
}

/** Method names a class binds in its constructor, in declaration order (Requirement 22.13). */
export type MethodValues = ReadonlyMap<string, readonly string[]>;

function constructorHook(tokens: readonly Token[], values: MethodValues): NonNullable<EmitHooks['constructorBody']> {
  return (cls: ClassNode, ctor: MethodNode | null): BodyItem[] | null => {
    const binds: BodyItem[] = (values.get(cls.name) ?? []).map((name) => ({
      kind: 'generated',
      text: `this.${name} = this.${name}.bind(this);`,
    }));
    const extendsBase = cls.extendsName !== null;

    if (ctor === null) {
      if (binds.length === 0) return null;
      return extendsBase ? [{ kind: 'generated', text: 'super(...args);' }, ...binds] : binds;
    }

    const body = ctor.body.nodes;
    /* A class without extends cannot call super() (TS2335); an AS3 super() there is dropped. */
    const superIdx = body.findIndex((n) => isSuperCall(tokens, n));
    if (binds.length === 0 && (extendsBase ? superIdx === 0 : superIdx < 0)) return null;

    const items: BodyItem[] = [];
    if (extendsBase) {
      items.push(superIdx >= 0 ? { kind: 'node', node: body[superIdx] } : { kind: 'generated', text: 'super();' });
    }
    items.push(...binds);
    body.forEach((n, i) => {
      if (i !== superIdx) items.push({ kind: 'node', node: n });
    });
    return items;
  };
}

/**
 * Field form of the binds (design 21.2): the first instance member, so its initialiser runs right after
 * `super` returns and before every other initialiser. Null for a class without binds.
 */
function bindsField(className: string, names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const body = names.map((n) => `    this.${n} = this.${n}.bind(this);`).join('\n');
  return `private readonly __binds_${className} = (() => {\n${body}\n  })();`;
}

/**
 * Head of a synthesised constructor (Requirement 22.13). A class with a base forwards its arguments, typed with
 * ConstructorParameters of the extends clause as written (...args: any[] gives TS2556).
 */
function forwardingHead(cls: ClassNode): string {
  if (cls.extendsName === null) return 'public constructor()';
  return `public constructor(...args: ConstructorParameters<typeof ${cls.extendsName}>)`;
}

function findPackageName(nodes: readonly Node[]): string {
  for (const n of nodes) if (n.kind === 'package') return n.name;
  return '';
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Qualified_Name that 
ame (as written in extends) stands for, or null when it has no source. */
function resolveHeritage(name: string, plan: ImportPlan): string | null {
  if (name.indexOf('.') >= 0) return plan.bindingOfChain.has(name) ? name : null;
  return plan.bindingOfBare.get(name) ?? null;
}

function collectClasses(nodes: readonly Node[], out: ClassInfo[], plan: ImportPlan): void {
  for (const n of nodes) {
    if (n.kind === 'package') collectClasses(n.body, out, plan);
    else if (n.kind === 'class') {
      out.push({
        name: n.name,
        extendsName: n.extendsName,
        extendsQualified: n.extendsName === null ? null : resolveHeritage(n.extendsName, plan),
      });
    }
  }
}

/** Rewrites dotted extends and implements names that the plan binds to their binding. */
function bindHeritage(nodes: readonly Node[], plan: ImportPlan): void {
  for (const n of nodes) {
    if (n.kind === 'package') bindHeritage(n.body, plan);
    else if (n.kind === 'class') {
      if (n.extendsName !== null) n.extendsName = plan.bindingOfChain.get(n.extendsName) ?? n.extendsName;
      n.implementsNames = n.implementsNames.map((x) => plan.bindingOfChain.get(x) ?? x);
    } else if (n.kind === 'interface') {
      // A parent with a source file has a token; one without is a type-only name (no run-time reference).
      n.parentTokens = n.extendsNames.filter((x) => resolveHeritage(x, plan) !== null).map((x) => plan.bindingOfChain.get(x) ?? x);
      n.extendsNames = n.extendsNames.map((x) => plan.bindingOfChain.get(x) ?? x);
    }
  }
}

function findInterfaces(nodes: readonly Node[], out: InterfaceNode[] = []): InterfaceNode[] {
  for (const n of nodes) {
    if (n.kind === 'package') findInterfaces(n.body, out);
    else if (n.kind === 'interface') out.push(n);
  }
  return out;
}

/** Decision D5: the whole file as `// AS3:` comments plus one line-1 Diagnostic. */
function fallback(source: string, firstMessage: string): TranslateResult {
  const lines = normalizeNewlines(source).split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const text = lines.map((l) => ('// AS3: ' + escapeComment(l)).trimEnd()).join('\n') + '\n';
  return {
    text,
    diagnostics: [
      {
        kind: 'unsupported-construct',
        line: 1,
        message: `translated output does not parse: ${firstMessage}`,
      },
    ],
    spans: [{ startLine: 1, endLine: lines.length, kind: 'unsupported' }],
    classes: [],
    packageName: '',
    importRecords: [],
  };
}

/**
 * Translate one AS3 file, then run the injected syntax check (decisions D4, D5).
 * Blank or whitespace-only input returns empty text and skips the check.
 */
export function translate(source: string, options: TranslateOptions): TranslateResult {
  const result = translateCore(source, options);
  if (source.trim() === '') return result;
  const errors = options.syntaxCheck(result.text);
  if (errors.length === 0) return result;
  return fallback(source, errors[0].message);
}

/** Translate one AS3 file. Does not run the syntax check. */
export function translateCore(source: string, options: TranslateOptions): TranslateResult {
  const src = normalizeNewlines(source);
  const tokens = tokenize(src);
  const { nodes } = scan(tokens);

  // The import plan is built once and shared by the rewriter and the import lines.
  const refs = collectReferences(tokens, nodes, options.siblingClasses);
  const planInput: ImportPlanInput = {
    selfQualified: options.selfQualified,
    declared: refs.declared,
    shimNames: options.shimNames,
    known: options.siblingClasses,
    imports: refs.imports,
    bare: refs.bare,
    chains: refs.chains,
  };
  // Member tables are built from the unrewritten nodes: base names are read as written.
  const tables =
    options.tables ?? buildMemberTables([{ qualified: options.selfQualified, nodes }], SHIM_MEMBER_TABLE);
  let plan = planFileImports(planInput);

  // Forced imports (design 18.5): a dry resolution pass collects the classes the rules want
  // imported (the declaring class of an inherited static); when one is not bound yet the plan
  // is made again with those targets forced, and the rewriting pass uses the final plan.
  const values = new Map<string, string[]>();
  // Classes in which an instance field initialiser reads a method value take the field form (design 21.2, D25).
  const fieldForm = new Set<string>();
  const dryRewriter = createRewriter(nodes, {
    shimNames: options.shimNames, plan, tables, self: options.selfQualified,
    onMethodValue: (cls, name, inFieldInit) => {
      const list = values.get(cls) ?? [];
      if (!list.includes(name)) list.push(name);
      values.set(cls, list);
      if (inFieldInit) fieldForm.add(cls);
    },
  });
  emitTs(nodes, { source: src, tokens, rewriter: dryRewriter });
  // Only imports of statements the dry pass kept count; a rolled-back statement left none (design 21.8).
  const wanted = new Set<string>(dryRewriter.forcedTargets?.() ?? []);
  // The dry pass found which methods are used as values; the binds follow declaration order.
  const dot = options.selfQualified.lastIndexOf('.');
  const selfSimple = options.selfQualified.slice(dot + 1);
  const bound = new Map<string, string[]>();
  for (const [name, used] of values) {
    const key = name === selfSimple ? options.selfQualified : dot < 0 ? name : `${options.selfQualified.slice(0, dot)}.${name}`;
    bound.set(name, orderByDeclaration(tables, key, new Set(used)));
  }
  // The constructor form is the default; the field form replaces it for a class that needs it.
  const constructorBinds = new Map<string, string[]>();
  const fieldBinds = new Map<string, string[]>();
  for (const [name, list] of bound) (fieldForm.has(name) ? fieldBinds : constructorBinds).set(name, list);
  if ([...wanted].some((t) => !plan.imports.some((p) => p.target === t))) {
    plan = planFileImports({ ...planInput, forced: [...wanted].sort(cmp) });
  }
  const selfPath = canonicalClassPath(options.selfQualified);
  // A name a class binds is never imported from the Shim.
  const shimUsed = [...refs.bare.keys()].filter(
    (n) => !refs.declared.has(n) && options.shimNames.has(n) && !plan.bindingOfBare.has(n),
  );
  // A translated interface file names the token factory and the token type (design 21.5).
  if (findInterfaces(nodes).length > 0) {
    for (const n of ['AS3InterfaceToken', 'defineInterface']) if (!shimUsed.includes(n)) shimUsed.push(n);
  }
  const imports = createImportLines(plan, selfPath, shimUsed);

  // Class info is read before the heritage names are rewritten to their bindings.
  const classes: ClassInfo[] = [];
  collectClasses(nodes, classes, plan);
  bindHeritage(nodes, plan);

  const rwOptions = { shimNames: options.shimNames, plan, tables, self: options.selfQualified };
  const out = emitTs(nodes, {
    source: src,
    tokens,
    rewriter: createRewriter(nodes, rwOptions),
    hooks: {
      importLines: () => imports.lines,
      constructorBody: constructorHook(tokens, constructorBinds),
      syntheticConstructorHead: forwardingHead,
      firstInstanceMember: (cls: ClassNode) => bindsField(cls.name, fieldBinds.get(cls.name) ?? []),
      childFieldNames: () => options.childNames ?? null,
      interfaceQualifiedName: () => options.selfQualified,
    },
  });
  // The interface is translated when its node survived the emit (a rolled-back node is an unsupported span).
  const interfaces = findInterfaces(nodes);
  const interfaceTranslated =
    interfaces.length > 0 &&
    interfaces.every((i) => !out.spans.some((s) => s.kind === 'unsupported' && s.startLine <= i.startLine && s.endLine >= i.endLine));
  const diagnostics =
    plan.diagnostics.length === 0
      ? out.diagnostics
      : [...out.diagnostics, ...plan.diagnostics].sort(
          (a, b) => a.line - b.line || cmp(a.kind, b.kind) || cmp(a.message, b.message),
        );
  return {
    text: out.text,
    diagnostics,
    spans: out.spans,
    classes,
    packageName: findPackageName(nodes),
    importRecords: imports.records,
    ...(interfaceTranslated ? { interfaceTranslated } : {}),
  };
}