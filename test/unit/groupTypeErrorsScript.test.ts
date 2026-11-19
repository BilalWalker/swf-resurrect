import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { errorsOfReport, formatGroups } from '../../scripts/group-type-errors';
import { groupTypeErrors } from '../../src/translate/typeErrorGroups';

const dir = mkdtempSync(join(tmpdir(), 'tegroups-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const report = JSON.stringify({
  classes: [{ className: 'A', typeErrors: [{ code: 2304, message: "Cannot find name 'X'." }] }, { className: 'B', typeErrors: [] }],
  otherErrors: [{ code: 2306, message: "File 'p' is not a module." }],
});

describe('group-type-errors script', () => {
  it('reads class errors and otherErrors from a report', () => {
    expect(errorsOfReport(report).map((e) => e.code)).toEqual([2304, 2306]);
    expect(errorsOfReport('{}')).toEqual([]);
  });
  it('prints the groups with the count per file', () => {
    const files = [{ file: 'one', errors: errorsOfReport(report) }];
    const out = formatGroups(files, groupTypeErrors(files), 10);
    expect(out).toContain('one: 2 errors');
    expect(out).toContain('1\t1\tTS2304 name X');
    expect(out).toContain('(2 groups in all)');
  });
  it('runs as a process on a generated report', () => {
    mkdirSync(join(dir, 'o'), { recursive: true });
    writeFileSync(join(dir, 'o', 'translation-report.json'), report);
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/group-type-errors.ts', join(dir, 'o')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('TS2304 name X');
  });
});
