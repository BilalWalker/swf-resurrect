// Core: no node:* import, not even node:path. Joins and relative specifiers are string functions.
import { PipelineError } from '../pipeline/errors';

/** 'a.b.Cls'; 'Cls' in the unnamed package. */
export type QualifiedName = string;

export interface QualifiedParts {
  pkg: readonly string[];
  simple: string;
}

export class InvalidClassNameError extends PipelineError {
  readonly code = 'INVALID_CLASS_NAME';

  constructor(
    readonly className: string,
    readonly reason: string,
    readonly stage: 'unpack' | 'convert',
  ) {
    super(`invalid class name "${className}": ${reason}`);
  }
}

const FORBIDDEN_CHARS = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/** Non-empty, not '.' or '..', none of / \ : * ? " < > |, and no code unit below 0x20. */
export function isSafeSegment(segment: string): boolean {
  if (segment === '' || segment === '.' || segment === '..') return false;
  for (let i = 0; i < segment.length; i++) {
    if (segment.charCodeAt(i) < 0x20) return false;
    if (FORBIDDEN_CHARS.has(segment[i])) return false;
  }
  return true;
}

/** Splits a dotted name into package segments and simple name; throws InvalidClassNameError. */
export function parseQualifiedName(name: string, stage: 'unpack' | 'convert' = 'convert'): QualifiedParts {
  if (name === '') throw new InvalidClassNameError(name, 'the name is empty', stage);
  const segments = name.split('.');
  for (const s of segments) {
    if (!isSafeSegment(s)) {
      throw new InvalidClassNameError(name, s === '' ? 'empty segment' : `unsafe segment "${s}"`, stage);
    }
  }
  return { pkg: segments.slice(0, -1), simple: segments[segments.length - 1] };
}

/** 'fl.controls.Slider' -> 'fl/controls/Slider.as'. */
export function scriptRelPath(name: QualifiedName): string {
  const { pkg, simple } = parseQualifiedName(name);
  return [...pkg, simple].join('/') + '.as';
}

/** 'fl/controls/Slider.as' -> 'fl.controls.Slider'; null for an unsafe segment, a stem with a dot, or a non-.as file. */
export function qualifiedFromScriptPath(relPosix: string): QualifiedName | null {
  if (!relPosix.endsWith('.as')) return null;
  const segments = relPosix.slice(0, -3).split('/');
  for (const s of segments) {
    if (!isSafeSegment(s) || s.includes('.')) return null;
  }
  return segments.join('.');
}

/** 'fl.controls.Slider' -> 'src/fl/controls/Slider.ts'. */
export function canonicalClassPath(name: QualifiedName): string {
  const { pkg, simple } = parseQualifiedName(name);
  return ['src', ...pkg, simple].join('/') + '.ts';
}

/** Specifier from one file path to another, without extension: './Slider', '../core/UIComponent'. */
export function relativeSpecifier(fromPath: string, toPath: string): string {
  const fromDir = fromPath.split('/').slice(0, -1);
  const toParts = toPath.replace(/\.ts$/, '').split('/');
  const toDir = toParts.slice(0, -1);
  const file = toParts[toParts.length - 1];
  let common = 0;
  while (common < fromDir.length && common < toDir.length && fromDir[common] === toDir[common]) common++;
  const ups = fromDir.length - common;
  const prefix = ups === 0 ? ['.'] : Array<string>(ups).fill('..');
  return [...prefix, ...toDir.slice(common), file].join('/');
}

/** '../shim' from 'src/X.ts'; '../../shim' from 'src/a/X.ts'. */
export function shimSpecifier(fromPath: string): string {
  return relativeSpecifier(fromPath, 'shim');
}
