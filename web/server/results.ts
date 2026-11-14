// Reads the pipeline's report files into the summary the UI shows. Pure: takes parsed JSON
// (unknown, since the files come from a run on untrusted input) and never throws on odd shapes.

export interface ScoreSummary {
  /** Percentage 0-100, or null when not compared. */
  value: number | null;
  /** Machine reason codes from the report when not compared (deduplicated), else empty. */
  reasons: string[];
  /** Short factual context, e.g. "3 of 3 frames compared" or "676 of 676 trace lines matched". */
  basis: string | null;
}

export interface ClassRow {
  className: string;
  status: string;
  omitted: boolean;
  overridden: boolean;
  path: string | null;
  diagnostics: number;
  typeErrors: number;
}

export interface ClassCounts {
  total: number;
  clean: number;
  loose: number;
  unsupported: number;
  omitted: number;
  overridden: number;
  typeErrors: number;
}

export interface UnsupportedRow {
  kind: string;
  message: string;
  id: number | null;
  tag: string | null;
}

export interface ResultSummary {
  overallMatch: ScoreSummary | null;
  traceScore: ScoreSummary | null;
  classCounts: ClassCounts | null;
  classes: ClassRow[];
  unsupported: UnsupportedRow[] | null;
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function visualScore(fidelity: Obj): ScoreSummary | null {
  const visual = obj(fidelity.visual);
  if (visual === null) return null;
  const value = num(visual.overallMatch);
  const compared = num(visual.comparedFrames);
  const notCompared = num(visual.notComparedFrames);
  const reasons = new Set<string>();
  for (const f of arr(visual.frames)) {
    const r = str(obj(f)?.reason);
    if (r !== null) reasons.add(r);
  }
  if (value === null && reasons.size === 0) reasons.add('no-frames-compared');
  const basis =
    compared !== null && notCompared !== null ? `${compared} of ${compared + notCompared} sampled frames compared` : null;
  return { value, reasons: value === null ? [...reasons] : [], basis };
}

function behaviourScore(fidelity: Obj): ScoreSummary | null {
  const b = obj(fidelity.behaviour);
  if (b === null) return null;
  if (b.status === 'compared') {
    const matched = num(b.matched);
    const ref = num(b.referenceLineCount);
    return {
      value: num(b.traceScore),
      reasons: [],
      basis: matched !== null && ref !== null ? `${matched} of ${ref} reference trace lines matched` : null,
    };
  }
  const reason = str(b.reason);
  return { value: null, reasons: reason === null ? ['unknown'] : [reason], basis: null };
}

function classesOf(translation: Obj): { counts: ClassCounts; rows: ClassRow[] } {
  const rows: ClassRow[] = [];
  for (const c of arr(translation.classes)) {
    const o = obj(c);
    if (o === null) continue;
    rows.push({
      className: str(o.className) ?? '?',
      status: str(o.status) ?? 'unknown',
      omitted: o.omitted === true,
      overridden: o.overridden === true,
      path: null,
      diagnostics: arr(o.diagnostics).length,
      typeErrors: arr(o.typeErrors).length,
    });
  }
  const paths = new Map<string, string>();
  for (const p of arr(translation.classPaths)) {
    const o = obj(p);
    const name = str(o?.className);
    const path = str(o?.path);
    if (name !== null && path !== null) paths.set(name, path);
  }
  for (const r of rows) r.path = paths.get(r.className) ?? null;
  const counts: ClassCounts = {
    total: rows.length,
    clean: rows.filter((r) => r.status === 'clean').length,
    loose: rows.filter((r) => r.status === 'loose').length,
    unsupported: rows.filter((r) => r.status === 'unsupported').length,
    omitted: rows.filter((r) => r.omitted).length,
    overridden: rows.filter((r) => r.overridden).length,
    typeErrors: rows.reduce((n, r) => n + r.typeErrors, 0) + arr(translation.otherErrors).length,
  };
  return { counts, rows };
}

function unsupportedOf(file: Obj): UnsupportedRow[] {
  const out: UnsupportedRow[] = [];
  for (const e of arr(file.entries)) {
    const o = obj(e);
    if (o === null) continue;
    out.push({ kind: str(o.kind) ?? 'unknown', message: str(o.message) ?? '', id: num(o.id), tag: str(o.tag) });
  }
  return out;
}

/** Each argument is the parsed file, or undefined when it does not exist or did not parse. */
export function summariseResults(fidelity: unknown, translation: unknown, unsupported: unknown): ResultSummary {
  const f = obj(fidelity);
  const t = obj(translation);
  const u = obj(unsupported);
  const classes = t === null ? null : classesOf(t);
  return {
    overallMatch: f === null ? null : visualScore(f),
    traceScore: f === null ? null : behaviourScore(f),
    classCounts: classes?.counts ?? null,
    classes: classes?.rows ?? [],
    unsupported: u === null ? null : unsupportedOf(u),
  };
}
