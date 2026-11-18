// Count of translated classes whose type check depends on a Flash_API_Table stub (robustness Requirement 17.9). Pure: no I/O.
//
// A class depends on a stub when the Shim import line of its translated file names the simple name of a `stub`
// entry (Sound, URLLoader, ...). The count goes into the Outcome_File as numbers.stubDependentClasses.

import { entryOf, stubClasses } from './flashApiTable';
import type { ImportRecord } from './types';

function simpleOf(qn: string): string {
  return qn.slice(qn.lastIndexOf('.') + 1);
}

/** Simple names of the stub classes. */
export function stubSimpleNames(): ReadonlySet<string> {
  return new Set(stubClasses().map(simpleOf));
}

/** Sorted stub names a class's resolved Shim imports use. */
export function stubsUsedBy(records: readonly ImportRecord[], stubs: ReadonlySet<string> = stubSimpleNames()): string[] {
  const used = new Set<string>();
  for (const r of records) {
    if (r.kind !== 'shim') continue;
    for (const n of r.names) if (stubs.has(n.name)) used.add(n.name);
  }
  return [...used].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Stub class of a Named_Limit id `api-stub:<Class>[.member]` or `api-stub-no-event:<Class>`; null for any other id. */
export function stubClassOfLimit(id: string): string | null {
  const m = /^api-stub(?:-no-event)?:([A-Za-z_$][\w$]*)/.exec(id);
  return m === null ? null : m[1]!;
}

/** True when the table marks the stub class of this limit id `canStall`. `navigateToURL` and unknown ids are false. */
export function limitCanStall(id: string): boolean {
  const cls = stubClassOfLimit(id);
  if (cls === null) return false;
  const q = stubClasses().find((s) => simpleOf(s) === cls);
  return q !== undefined && entryOf(q)?.canStall === true;
}

/** Number of classes with at least one stub in their Shim imports. */
export function countStubDependents(classes: ReadonlyArray<{ importRecords?: readonly ImportRecord[] }>): number {
  const stubs = stubSimpleNames();
  return classes.filter((c) => stubsUsedBy(c.importRecords ?? [], stubs).length > 0).length;
}
