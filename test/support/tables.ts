import { readdirSync, readFileSync } from 'node:fs';
import { buildMemberTables } from '../../src/translate/memberTables';
import type { MemberTables } from '../../src/translate/memberTables';
import { SHIM_MEMBER_TABLE } from '../../src/translate/shimMembers.generated';
import { fileFromSource } from '../property/gen/genClassContext';

/** Member tables for the classes of a fixture sample directory (scripts/*.as) plus extra (qualified, source) files. */
export function fixtureTables(dir: string, extra: ReadonlyArray<[string, string]> = []): MemberTables {
  const files = readdirSync(dir + '/scripts')
    .map((n) => n.slice(0, -3))
    .filter((n) => !extra.some(([q]) => q === n))
    .map((n) => fileFromSource(n, readFileSync(dir + '/scripts/' + n + '.as', 'utf8')));
  return buildMemberTables([...files, ...extra.map(([q, s]) => fileFromSource(q, s))], SHIM_MEMBER_TABLE);
}
