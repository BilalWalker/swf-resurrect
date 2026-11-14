// Pure: turns FFDec dumps and pipeline reports into short text an agent can read in one call.

export interface DumpSummary {
  ffdecVersion: string | null;
  swfVersion: number | null;
  frameCount: number | null;
  frameRate: number | null;
  compression: string | null;
  /** Stage size in pixels (the dump stores twips). */
  stage: { width: number; height: number } | null;
  actionScript3: boolean;
  hasSymbolClass: boolean;
  /** SWF tag type -> count, only names ending in "Tag". */
  tags: Array<{ type: string; count: number }>;
  /** DoABC / class traits found in the dump. */
  classCount: number;
}

function attr(text: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(text);
  return m === null ? null : m[1];
}

function num(text: string | null): number | null {
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Summarises an FFDec `-swf2xml` dump without building a DOM. */
export function summariseDump(xml: string): DumpSummary {
  const swfOpen = /<swf\b[^>]*>/.exec(xml)?.[0] ?? '';
  const rect = /<displayRect\b[^>]*>/.exec(xml)?.[0] ?? '';
  const xMax = num(attr(rect, 'Xmax'));
  const xMin = num(attr(rect, 'Xmin'));
  const yMax = num(attr(rect, 'Ymax'));
  const yMin = num(attr(rect, 'Ymin'));
  const counts = new Map<string, number>();
  for (const m of xml.matchAll(/<item type="([A-Za-z0-9]+Tag)"/g)) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  const generator = attr(swfOpen, '_generator');
  return {
    ffdecVersion: generator === null ? null : (/v\.([0-9.]+)/.exec(generator)?.[1] ?? null),
    swfVersion: num(attr(swfOpen, 'version')),
    frameCount: num(attr(swfOpen, 'frameCount')),
    frameRate: num(attr(swfOpen, 'frameRate')),
    compression: attr(swfOpen, 'compression'),
    stage:
      xMax === null || xMin === null || yMax === null || yMin === null
        ? null
        : { width: (xMax - xMin) / 20, height: (yMax - yMin) / 20 },
    actionScript3: /<item type="FileAttributesTag"[^>]*\bactionScript3="true"/.test(xml),
    hasSymbolClass: counts.has('SymbolClassTag'),
    tags: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1)),
    classCount: (xml.match(/<item type="TraitClass"/g) ?? []).length,
  };
}

export function renderDumpSummary(swf: string, s: DumpSummary): string {
  const lines = [
    `SWF: ${swf}`,
    `SWF version ${s.swfVersion ?? '?'}, ${s.frameCount ?? '?'} root frames at ${s.frameRate ?? '?'} fps, ` +
      `stage ${s.stage === null ? '?' : `${s.stage.width} x ${s.stage.height} px`}, compression ${s.compression ?? '?'}`,
    `ActionScript 3: ${s.actionScript3 ? 'yes' : 'NO (the pipeline only handles AS3)'}`,
    `SymbolClass tag: ${s.hasSymbolClass ? 'yes' : 'no (no library symbol is linked to a class)'}`,
    `Classes in ABC: ${s.classCount}`,
    `FFDec ${s.ffdecVersion ?? '?'}`,
    'Tags:',
    ...s.tags.map((t) => `  ${String(t.count).padStart(4)}  ${t.type}`),
  ];
  return lines.join('\n');
}

/** Turns a path under FFDec's scripts/ export into a Qualified_Name: `fl/controls/Slider.as` -> `fl.controls.Slider`. */
export function classNameOfScript(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/\.as$/, '').split('/').join('.');
}

/** Inverse of classNameOfScript; null when the name could escape the scripts directory. */
export function scriptPathOfClass(className: string): string | null {
  if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(className)) return null;
  return `${className.split('.').join('/')}.as`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function scoreText(section: unknown, key: string): string {
  if (!isObject(section)) return 'missing from report';
  if (section.status === 'compared' && typeof section[key] === 'number') return `${(section[key] as number).toFixed(2)}%`;
  const reason = typeof section.reason === 'string' ? ` (${section.reason})` : '';
  return `${String(section.status ?? 'unknown')}${reason}`;
}

export interface ReportInputs {
  fidelity: unknown | null;
  translation: unknown | null;
  unsupported: unknown | null;
}

/** Short text summary of the three report files of an output directory. Missing files are named, never guessed. */
export function renderReportSummary(dir: string, r: ReportInputs): string {
  const lines: string[] = [`Output directory: ${dir}`];
  if (isObject(r.fidelity)) {
    const f = r.fidelity;
    const visual = isObject(f.visual) ? f.visual : {};
    lines.push(`Sample: ${String(f.sample ?? '?')}`);
    lines.push(`Overall_Match: ${scoreText(f.visual, 'overallMatch')}`);
    lines.push(`Trace_Score: ${scoreText(f.behaviour, 'traceScore')}`);
    lines.push(
      `Frames compared: ${String(visual.comparedFrames ?? '?')}, not compared: ${String(visual.notComparedFrames ?? '?')}`,
    );
    const worst = list(visual.frames)
      .filter((x): x is Record<string, unknown> => isObject(x) && typeof x.matchPercent === "number")
      .sort((a, b) => (a.matchPercent as number) - (b.matchPercent as number))
      .slice(0, 5)
      .filter((x) => (x.matchPercent as number) < 100);
    if (worst.length > 0) {
      lines.push('Lowest frames:');
      for (const x of worst) lines.push(`  frame ${String(x.frame ?? '?')}: ${(x.matchPercent as number).toFixed(2)}%`);
    }
    for (const [label, key, holder] of [
      ['Known visual limits', 'knownVisualLimits', f.visual],
      ['Known behaviour gaps', 'knownBehaviourGaps', f.behaviour],
    ] as const) {
      const items = isObject(holder) ? list(holder[key]) : [];
      if (items.length > 0) {
        lines.push(`${label}:`);
        for (const item of items) lines.push(`  ${typeof item === 'string' ? item : JSON.stringify(item)}`);
      }
    }
    const problems = list(f.problems);
    lines.push(`Problems: ${problems.length}`);
    for (const p of problems.slice(0, 20)) lines.push(`  ${typeof p === 'string' ? p : JSON.stringify(p)}`);
    if (problems.length > 20) lines.push(`  ... ${problems.length - 20} more`);
  } else {
    lines.push('fidelity-report.json: not found (run the pipeline with --verify)');
  }

  if (isObject(r.translation)) {
    const classes = list(r.translation.classes).filter(isObject);
    const byStatus = new Map<string, string[]>();
    for (const c of classes) {
      const status = String(c.status ?? "unknown");
      const name = String(c.className ?? "?");
      byStatus.set(status, [...(byStatus.get(status) ?? []), name]);
    }
    lines.push(`Classes: ${classes.length} (type check: ${String(r.translation.typeCheck ?? '?')})`);
    for (const [status, names] of [...byStatus.entries()].sort()) {
      lines.push(`  ${status}: ${names.length}${names.length <= 12 ? ` (${names.join(', ')})` : ''}`);
    }
    const other = list(r.translation.otherErrors);
    if (other.length > 0) lines.push(`Other errors: ${other.length}`);
  } else {
    lines.push('translation-report.json: not found');
  }

  if (isObject(r.unsupported)) {
    const entries = list(r.unsupported.entries);
    lines.push(`Unsupported features: ${entries.length}`);
    for (const e of entries.slice(0, 30)) lines.push(`  ${typeof e === 'string' ? e : JSON.stringify(e)}`);
    if (entries.length > 30) lines.push(`  ... ${entries.length - 30} more`);
  } else {
    lines.push('unsupported-features.json: not found');
  }
  return lines.join('\n');
}
