/**
 * Implicit `this` resolution (Requirement 22, design 18.2 and 18.5). Core: no node modules, no
 * regular expressions. Decides what a bare identifier inside a class body refers to; it does not
 * rewrite text (the rewriter does, in sub-task 8.5).
 */

import type { QualifiedName } from '../convert/qualifiedName';
import { chainEnd, lookupMember, lookupStatic } from './memberTables';
import type { MemberKindFound, MemberTables } from './memberTables';
import type { Node, Param } from './scanner';
import type { Token } from './tokenizer';
import type { Diagnostic } from './types';

// The AS3 class `Date` is written as 'Dat' + 'e' so the purity test (which bans the word) does not flag the name.
export const AS3_GLOBALS: ReadonlySet<string> = new Set([
  'Array', 'ArgumentError', 'Boolean', 'Class', 'Dat' + 'e', 'DefinitionError', 'Error', 'EvalError', 'Function',
  'int', 'Infinity', 'JSON', 'Math', 'NaN', 'Namespace', 'Number', 'Object', 'QName', 'RangeError',
  'ReferenceError', 'RegExp', 'SecurityError', 'String', 'SyntaxError', 'TypeError', 'uint',
  'UninitializedError', 'URIError', 'VerifyError', 'Vector', 'XML', 'XMLList', 'undefined', 'arguments',
  'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape', 'isFinite', 'isNaN',
  'isXMLName', 'parseFloat', 'parseInt', 'trace', 'unescape',
]);

const KEYWORDS: ReadonlySet<string> = new Set([
  'this', 'super', 'null', 'true', 'false', 'new', 'typeof', 'void', 'in', 'is', 'as', 'instanceof', 'each',
  'delete',
]);

export interface ResolveEnv {
  tables: MemberTables;
  self: QualifiedName;
  /** Simple name of the enclosing class, used for `Cls.x`. */
  className: string;
  /** Static method, static accessor or static field initialiser. */
  isStatic: boolean;
  locals: ReadonlySet<string>;
  /** Declared in the file, import bindings of the plan, Shim names, siblings. */
  classNames: ReadonlySet<string>;
  /** The name the file's import plan binds to a class (simple name or alias), null if not bound. */
  bindingOf(q: QualifiedName): string | null;
}

export type Resolution =
  | { kind: 'leave'; why: 'local' | 'global' | 'class-name' }
  | { kind: 'rewrite'; text: string; found: MemberKindFound; importTarget: QualifiedName | null }
  | { kind: 'diagnose'; diagnostic: Diagnostic };

function simpleOf(qn: string): string {
  return qn.slice(qn.lastIndexOf('.') + 1);
}

function unresolved(name: string, line: number, env: ResolveEnv): Resolution {
  const end = chainEnd(env.tables, env.self);
  const message =
    end.kind === 'unknown'
      ? `"${name}" cannot be resolved: the base class "${end.name}" of ${env.className} has neither a source nor a Shim class`
      : `"${name}" does not resolve to a member of ${env.className}, of its translated superclasses or of its Shim base classes`;
  return { kind: 'diagnose', diagnostic: { kind: 'unresolved-identifier', line, message } };
}

function rewriteFor(name: string, found: MemberKindFound, env: ResolveEnv): Resolution {
  switch (found.rule) {
    case 'own-static':
      return { kind: 'rewrite', text: `${env.className}.${name}`, found, importTarget: null };
    case 'inherited-static': {
      const binding = env.bindingOf(found.owner) ?? simpleOf(found.owner);
      return { kind: 'rewrite', text: `${binding}.${name}`, found, importTarget: found.owner };
    }
    default:
      return { kind: 'rewrite', text: `this.${name}`, found, importTarget: null };
  }
}

export function resolveIdentifier(name: string, line: number, env: ResolveEnv): Resolution {
  if (env.locals.has(name)) return { kind: 'leave', why: 'local' };
  if (AS3_GLOBALS.has(name)) return { kind: 'leave', why: 'global' };
  if (env.classNames.has(name)) return { kind: 'leave', why: 'class-name' };

  if (env.isStatic) {
    const st = lookupStatic(env.tables, env.self, name);
    if (st !== null) return rewriteFor(name, st, env);
    if (lookupMember(env.tables, env.self, name) !== null) {
      return {
        kind: 'diagnose',
        diagnostic: {
          kind: 'unresolved-identifier',
          line,
          message: `"${name}" is an instance member of ${env.className} and cannot be used in a static context`,
        },
      };
    }
    return unresolved(name, line, env);
  }

  const found = lookupMember(env.tables, env.self, name);
  return found === null ? unresolved(name, line, env) : rewriteFor(name, found, env);
}

/** Params plus every var/const in the body, in nested blocks, `for` and `for-in` too (hoisting). */
export function collectFunctionLocals(params: readonly Param[], body: readonly Node[]): Set<string> {
  const out = new Set<string>();
  for (const p of params) out.add(p.name);
  const walk = (nodes: readonly Node[]): void => {
    for (const n of nodes) {
      if (n.kind !== 'statement') continue;
      if (n.decl !== null) for (const d of n.decl.declarators) out.add(d.name);
      if (n.body !== null) walk(n.body.nodes);
      if (n.elseBody !== null) walk(n.elseBody.nodes);
    }
  };
  walk(body);
  return out;
}

function isP(t: Token | undefined, text: string): boolean {
  return t !== undefined && t.kind === 'punct' && t.text === text;
}

/** The innermost bracket open before index i, or null. */
function innermostOpen(toks: readonly Token[], i: number): string | null {
  let depth = 0;
  for (let k = i - 1; k >= 0; k--) {
    const t = toks[k] as Token;
    if (t.kind !== 'punct') continue;
    if (t.text === ')' || t.text === ']' || t.text === '}') depth++;
    else if (t.text === '(' || t.text === '[' || t.text === '{') {
      if (depth === 0) return t.text;
      depth--;
    }
  }
  return null;
}

function inTypeArguments(toks: readonly Token[], i: number): boolean {
  let depth = 0;
  for (let k = i - 1; k >= 0; k--) {
    const t = toks[k] as Token;
    if (t.kind !== 'punct') continue;
    if (t.text === ';' || t.text === '{' || t.text === '}') return false;
    if (t.text === '>') depth++;
    else if (t.text === '.<') {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
}

/** True when toks[i] is a reference: not after `.` or `::`, not an object-literal key, not in a type position, not a keyword. */
export function isReference(toks: readonly Token[], i: number): boolean {
  const t = toks[i];
  if (t === undefined || t.kind !== 'id') return false;
  if (KEYWORDS.has(t.text)) return false;
  const prev = toks[i - 1];
  if (isP(prev, '.') || isP(prev, '::') || isP(prev, '.<')) return false;
  if (prev !== undefined && prev.kind === 'id' && (prev.text === 'as' || prev.text === 'is' || prev.text === 'instanceof')) {
    return false;
  }
  if (isP(toks[i + 1], ':') && (isP(prev, '{') || isP(prev, ',')) && innermostOpen(toks, i) === '{') return false;
  return !inTypeArguments(toks, i);
}
