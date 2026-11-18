/**
 * Pure helpers for the `recovery` record (robustness 18.3, D-B7, Requirements 16.4, 16.7, 16.8). No fs, no clock.
 */
import type { UnsupportedFeatureEntry } from '../pipeline/unsupported';

/** The two tokens FFDec leaves in source it could not structure. */
export const SOURCE_SIGNAL_TOKENS: readonly string[] = ['§§push', '§§pop'];

/**
 * Names renamed by the rename step: invalid names of the original scan minus those of the renamed copy.
 * Clamped at 0, so a renamed copy that scans worse (or a scan that failed, passed as null) counts 0, never a negative number.
 */
export function renamedIdentifiers(originalInvalid: number, renamedInvalid: number | null): number {
  if (renamedInvalid === null) return 0;
  return Math.max(0, originalInvalid - renamedInvalid);
}

export function hasSourceSignal(source: string): boolean {
  return SOURCE_SIGNAL_TOKENS.some((t) => source.includes(t));
}

/** `pkg/Name.as` (either separator) to the qualified name `pkg.Name`; null when the path is not an `.as` file. */
export function classNameOfScript(relPath: string): string | null {
  const p = relPath.replace(/\\/g, '/');
  if (!p.endsWith('.as')) return null;
  return p.slice(0, -3).split('/').filter((s) => s !== '').join('.');
}

export const UNRECOVERABLE_MESSAGE = 'the decompiled source is not readable after deobfuscation';
export const OBFUSCATION_RECOVERED_MESSAGE = 'class names were rewritten by FFDec and may differ from the original names';

/** One `unrecoverable-class` entry per class name, sorted by name. */
export function unrecoverableEntries(classNames: readonly string[]): UnsupportedFeatureEntry[] {
  return [...new Set(classNames)].sort().map((c) => ({
    kind: 'unrecoverable-class' as const,
    tag: c,
    message: `${c}: ${UNRECOVERABLE_MESSAGE}`,
  }));
}

/** The Named_Limit `obfuscation-recovered`: an Unsupported_Feature_List entry of that kind (like `as3-interface`), never a gap. */
export function obfuscationRecoveredEntry(): UnsupportedFeatureEntry {
  return { kind: 'obfuscation-recovered', message: OBFUSCATION_RECOVERED_MESSAGE };
}
