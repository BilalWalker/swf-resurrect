// Unsupported_Feature_List entries, their total order and the file format.
// Pure: no fs, clock, randomness or locale-dependent calls.
import { canonicalJson } from './canonicalJson';
import type { UnsupportedKind } from '../convert/model';

export interface UnsupportedFeatureEntry {
  kind: UnsupportedKind;
  id?: number; // SWF character id when known
  tag?: string; // tag name when known
  message: string;
  context?: { spriteId: number; frame: number; depth: number }; // set on dropped placements
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0; // UTF-16 code unit order
}

function cmpNum(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Total order: (kind, id, tag, spriteId, frame, depth, message). Missing numbers sort as -1, missing tag as ''. */
export function compareUnsupported(a: UnsupportedFeatureEntry, b: UnsupportedFeatureEntry): number {
  return (
    cmpStr(a.kind, b.kind) ||
    cmpNum(a.id ?? -1, b.id ?? -1) ||
    cmpStr(a.tag ?? '', b.tag ?? '') ||
    cmpNum(a.context?.spriteId ?? -1, b.context?.spriteId ?? -1) ||
    cmpNum(a.context?.frame ?? -1, b.context?.frame ?? -1) ||
    cmpNum(a.context?.depth ?? -1, b.context?.depth ?? -1) ||
    cmpStr(a.message, b.message)
  );
}

export function sortUnsupported(entries: readonly UnsupportedFeatureEntry[]): UnsupportedFeatureEntry[] {
  return [...entries].sort(compareUnsupported);
}

/** Canonical file text: { "entries": [...], "formatVersion": 1 }. Entries are sorted here. */
export function serialiseUnsupported(entries: readonly UnsupportedFeatureEntry[]): string {
  return canonicalJson({ entries: sortUnsupported(entries), formatVersion: 1 });
}
