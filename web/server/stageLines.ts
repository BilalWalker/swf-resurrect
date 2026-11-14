// Parses the progress lines the pipeline CLI prints (src/pipeline/pipeline.ts). Pure.
// The CLI is the contract: the web server never imports engine internals, it reads these lines.

export const PIPELINE_STAGES = ['unpack', 'convert', 'translate', 'emit', 'typecheck', 'verify'] as const;
export type PipelineStageKey = (typeof PIPELINE_STAGES)[number];
/** `build` is the web server's own step: it builds the emitted project for the preview. */
export type StageKey = PipelineStageKey | 'build';
export const ALL_STAGES: readonly StageKey[] = [...PIPELINE_STAGES, 'build'];

export type Facts = Record<string, number | null>;

export type ParsedLine =
  | { type: 'stage-ok'; stage: PipelineStageKey; detail: string | null; facts: Facts }
  | { type: 'typecheck-errors'; count: number; detail: string }
  | { type: 'verify'; overallMatch: number | null; traceScore: number | null }
  | { type: 'verify-trace'; missing: number; extra: number }
  | { type: 'verify-note'; text: string }
  | { type: 'warn'; stage: string; message: string }
  | { type: 'error'; stage: string; message: string }
  | { type: 'done' }
  | { type: 'log' };

export function isPipelineStage(s: string): s is PipelineStageKey {
  return (PIPELINE_STAGES as readonly string[]).includes(s);
}

function int(s: string): number {
  return Number.parseInt(s, 10);
}

function pct(s: string): number | null {
  return s === 'not-compared' ? null : Number.parseFloat(s);
}

function stageFacts(stage: PipelineStageKey, detail: string | null): Facts {
  if (detail === null) return {};
  let m: RegExpMatchArray | null;
  if (stage === 'convert' && (m = detail.match(/^(\d+) svg written, (\d+) morph skipped$/))) {
    return { svgWritten: int(m[1]), morphSkipped: int(m[2]) };
  }
  if (stage === 'translate' && (m = detail.match(/^(\d+) classes: (\d+) clean, (\d+) loose, (\d+) unsupported$/))) {
    return { classes: int(m[1]), clean: int(m[2]), loose: int(m[3]), unsupported: int(m[4]) };
  }
  if (stage === 'typecheck' && (m = detail.match(/^(\d+) errors?$/))) return { errors: int(m[1]) };
  return {};
}

const PCT = '(\\d+(?:\\.\\d+)?%|not-compared)';
const VERIFY = new RegExp(`^\\[verify\\] overall match ${PCT}, trace score ${PCT}(?: -> .*)?$`);

/** One line without its line break. Unknown lines are `log`. */
export function parseLine(raw: string): ParsedLine {
  const line = raw.replace(/\r$/, '');
  let m: RegExpMatchArray | null;
  if ((m = line.match(VERIFY))) {
    return { type: 'verify', overallMatch: pct(m[1].replace('%', '')), traceScore: pct(m[2].replace('%', '')) };
  }
  if ((m = line.match(/^\[([a-z]+)\] ok(?: \((.*)\))?$/)) && isPipelineStage(m[1])) {
    const stage = m[1];
    const detail = m[2] ?? null;
    return { type: 'stage-ok', stage, detail, facts: stageFacts(stage, detail) };
  }
  if ((m = line.match(/^\[typecheck\] (\d+) errors?: (.*)$/))) {
    return { type: 'typecheck-errors', count: int(m[1]), detail: m[2] };
  }
  if ((m = line.match(/^ {2}trace: (\d+) missing, (\d+) extra$/))) {
    return { type: 'verify-trace', missing: int(m[1]), extra: int(m[2]) };
  }
  if ((m = line.match(/^ {2}input note: (.*)$/))) return { type: 'verify-note', text: m[1] };
  if ((m = line.match(/^warn \[([a-z-]+)\]: (.*)$/))) return { type: 'warn', stage: m[1], message: m[2] };
  if ((m = line.match(/^error \[([a-z-]+)\]: (.*)$/))) return { type: 'error', stage: m[1], message: m[2] };
  if (/^Done: /.test(line)) return { type: 'done' };
  return { type: 'log' };
}

/**
 * Splits streamed text into complete lines. Returns the lines and the unfinished rest, which the
 * caller passes back in with the next chunk.
 */
export function splitLines(pending: string, chunk: string): { lines: string[]; rest: string } {
  const text = pending + chunk;
  const parts = text.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.map((p) => p.replace(/\r$/, '')), rest };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces server paths in text shown to the browser (job directory, repo root) with short labels,
 * in both slash styles and case-insensitively (Windows paths). Longer paths are replaced first.
 */
export function redactPaths(text: string, replacements: ReadonlyArray<readonly [string, string]>): string {
  const sorted = [...replacements].filter(([p]) => p.length > 0).sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [path, label] of sorted) {
    const variants = new Set([path, path.replace(/\\/g, '/'), path.replace(/\//g, '\\')]);
    for (const v of variants) out = out.replace(new RegExp(escapeRegExp(v), 'gi'), label);
  }
  return out;
}
