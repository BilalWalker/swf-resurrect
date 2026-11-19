// `npm run report:type-errors -- <out dir>...`: reads translation-report.json of each output
// directory, groups the type errors (class errors and otherErrors) by root cause and prints the
// groups with the count per directory. Also writes .work/type-error-groups.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupTypeErrors, topGroups, type FileErrors, type TypeErrorGroup, type TypeErrorLike } from '../src/translate/typeErrorGroups.js';

interface ReportShape {
  classes?: { typeErrors?: TypeErrorLike[] }[];
  otherErrors?: TypeErrorLike[];
}

export function errorsOfReport(text: string): TypeErrorLike[] {
  const r = JSON.parse(text) as ReportShape;
  const out: TypeErrorLike[] = [];
  for (const c of r.classes ?? []) for (const e of c.typeErrors ?? []) out.push({ code: e.code, message: e.message });
  for (const e of r.otherErrors ?? []) out.push({ code: e.code, message: e.message });
  return out;
}

export function formatGroups(files: readonly FileErrors[], groups: readonly TypeErrorGroup[], top: number): string {
  const lines: string[] = [];
  for (const f of files) lines.push(`${f.file}: ${f.errors.length} errors`);
  lines.push('');
  lines.push(['total', ...files.map((f) => f.file), 'group'].join('\t'));
  for (const g of topGroups(groups, top)) lines.push([g.total, ...files.map((f) => g.perFile[f.file] ?? 0), g.key].join('\t'));
  lines.push(`(${groups.length} groups in all)`);
  return lines.join('\n');
}

function main(): number {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: npm run report:type-errors -- <out dir>...');
    return 2;
  }
  const files: FileErrors[] = [];
  for (const d of dirs) {
    try {
      files.push({ file: basename(resolve(d)), errors: errorsOfReport(readFileSync(join(d, 'translation-report.json'), 'utf8')) });
    } catch (e) {
      console.error(`cannot read ${join(d, 'translation-report.json')}: ${(e as Error).message}`);
      return 2;
    }
  }
  const groups = groupTypeErrors(files);
  console.log(formatGroups(files, groups, 10));
  mkdirSync('.work', { recursive: true });
  writeFileSync('.work/type-error-groups.json', JSON.stringify({ files: files.map((f) => ({ file: f.file, errors: f.errors.length })), groups }, null, 2) + '\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
