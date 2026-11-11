/**
 * Parser and validator for samples/<name>/PROVENANCE.md.
 * Pure string functions: no file system access here.
 */

export const LICENCE_ALLOW_LIST: readonly string[] = [
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "CC0-1.0",
  "CC-BY-4.0",
  "Unlicense",
];

export interface ButtonState {
  readonly playing: boolean;
  /** 1-based frame. For "playing from N" this is N. */
  readonly frame: number;
}

export interface ExpectedRow {
  readonly action: string;
  readonly l_button: ButtonState;
  readonly r_button: ButtonState;
}

export class ExpectedStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpectedStateError";
  }
}

function splitRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const inner = t.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function stripTicks(s: string): string {
  return s.replace(/`/g, "").trim();
}

/** Parse one cell such as "`gotoAndPlay(2)`: playing from 2" or "stopped, frame 1". */
function parseCell(cell: string, totalFrames: number, where: string): ButtonState {
  const m = /(stopped|playing)(?:,\s*frame\s+|\s+from\s+)(\d+)/.exec(stripTicks(cell));
  if (!m) throw new ExpectedStateError(`${where}: cannot parse state "${cell}"`);
  const frame = Number(m[2]);
  if (!Number.isInteger(frame) || frame < 1 || frame > totalFrames) {
    throw new ExpectedStateError(`${where}: frame ${m[2]} is outside 1..${totalFrames}`);
  }
  return { playing: m[1] === "playing", frame };
}

/**
 * Parse the Expected_State table (header starts with "Action", then the
 * `l_button` and `r_button` columns). Throws ExpectedStateError when the table
 * is missing or a row is invalid. `totalFrames` is the frame count of the
 * button sprites (2 for the Click_Sample).
 */
export function parseExpectedState(text: string, totalFrames = 2): ExpectedRow[] {
  const lines = text.split(/\r?\n/);
  let i = lines.findIndex((l) => {
    const c = splitRow(l);
    return c !== null && c.length >= 3 && stripTicks(c[0]).toLowerCase() === "action";
  });
  if (i < 0) throw new ExpectedStateError("Expected_State table not found");
  const header = splitRow(lines[i])!.map(stripTicks);
  const lCol = header.indexOf("l_button");
  const rCol = header.indexOf("r_button");
  if (lCol < 0 || rCol < 0) {
    throw new ExpectedStateError("Expected_State table needs l_button and r_button columns");
  }
  const rows: ExpectedRow[] = [];
  for (i += 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells === null) break;
    if (isSeparator(cells)) continue;
    const action = stripTicks(cells[0]);
    if (cells.length <= Math.max(lCol, rCol)) {
      throw new ExpectedStateError(`row "${action}": too few columns`);
    }
    rows.push({
      action,
      l_button: parseCell(cells[lCol], totalFrames, `row "${action}" l_button`),
      r_button: parseCell(cells[rCol], totalFrames, `row "${action}" r_button`),
    });
  }
  if (rows.length === 0) throw new ExpectedStateError("Expected_State table has no rows");
  return rows;
}

/** Read the `| Field | Value |` table into a map keyed by lower-case field name. */
function parseFields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const c = splitRow(line);
    if (c === null || c.length < 2 || isSeparator(c)) continue;
    const key = stripTicks(c[0]).toLowerCase();
    if (!out.has(key)) out.set(key, c.slice(1).join("|").trim());
  }
  return out;
}

export function isAllowedLicence(expr: string): boolean {
  const terms = expr
    .replace(/[()]/g, " ")
    .split(/\s+OR\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return terms.some((t) => LICENCE_ALLOW_LIST.includes(t));
}

function isAbsoluteHttpUrl(s: string): boolean {
  if (/\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validate a provenance note. Returns a list of problems; empty means valid.
 * Each problem names the field. For the Click_Sample the Expected_State must
 * also parse.
 */
export function validateProvenance(text: string, opts: { clickSample: boolean }): string[] {
  const problems: string[] = [];
  const fields = parseFields(text);

  const author = fields.get("author");
  if (author === undefined || author === "") problems.push("field 'author' is missing or empty");

  const url = fields.get("source url");
  if (url === undefined || url === "") {
    problems.push("field 'source URL' is missing or empty");
  } else if (!isAbsoluteHttpUrl(url)) {
    problems.push(`field 'source URL' is not an absolute http or https URL: ${url}`);
  }

  const licence = fields.get("licence") ?? fields.get("license");
  if (licence === undefined || licence === "") {
    problems.push("field 'licence' is missing or empty");
  } else if (!isAllowedLicence(licence)) {
    problems.push(`field 'licence' has no allow-listed term: ${licence}`);
  }

  if (opts.clickSample) {
    try {
      parseExpectedState(text);
    } catch (e) {
      problems.push(`field 'Expected_State' is invalid: ${(e as Error).message}`);
    }
  }
  return problems;
}
