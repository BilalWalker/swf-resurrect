// Pure Replay planning (design section 6): Input_Groups, Click pairing, tick count.

export type PlanProblem =
  | { kind: 'unpaired-mouse-event'; index: number }
  | { kind: 'unsupported-input'; index: number; detail: string }
  | { kind: 'unused-input'; index: number };

export interface PlannedClick {
  tick: number;
  x: number;
  y: number;
  downIndex: number;
  upIndex: number;
}

export type TickSource = 'num_frames' | 'num_ticks' | 'input-groups';

export interface ReplayPlan {
  tickCount: number;
  tickSource: TickSource;
  clicks: PlannedClick[];
  problems: PlanProblem[];
}

export interface TickOptions {
  numFrames: number | null;
  numTicks: number | null;
  tickRate: number | null;
}

/**
 * Reads the top-level `num_frames`, `num_ticks` (non-negative integers) and `tick_rate` (number)
 * keys of a Ruffle test.toml. A line starting with `[` ends the top level; comments and `\r` are ignored.
 */
export function parseTickOptions(tomlText: string | null): TickOptions {
  const opts: TickOptions = { numFrames: null, numTicks: null, tickRate: null };
  if (tomlText === null) return opts;
  for (const raw of tomlText.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('[')) break;
    const m = /^\s*(num_frames|num_ticks|tick_rate)\s*=\s*([^\s#]+)\s*(?:#.*)?$/.exec(line);
    if (m === null) continue;
    const key = m[1]!;
    const value = m[2]!;
    if (key === 'tick_rate') {
      if (opts.tickRate === null && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) {
        opts.tickRate = Number(value);
      }
    } else if (/^\d+$/.test(value)) {
      if (key === 'num_frames' && opts.numFrames === null) opts.numFrames = parseInt(value, 10);
      if (key === 'num_ticks' && opts.numTicks === null) opts.numTicks = parseInt(value, 10);
    }
  }
  return opts;
}

/** Ruffle's `num_frames.or(num_ticks)`; null when neither key is present. */
export function parseNumFrames(tomlText: string | null): number | null {
  const o = parseTickOptions(tomlText);
  return o.numFrames ?? o.numTicks;
}

type Entry =
  | { kind: 'wait' }
  | { kind: 'down' | 'up'; x: number; y: number }
  | { kind: 'unsupported'; detail: string };

function classify(raw: unknown): Entry {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { kind: 'unsupported', detail: 'entry is not an object' };
  }
  const e = raw as Record<string, unknown>;
  if (e['type'] === 'Wait') return { kind: 'wait' };
  if (e['type'] === 'MouseDown' || e['type'] === 'MouseUp') {
    if (e['btn'] !== 'Left') return { kind: 'unsupported', detail: `button ${String(e['btn'])}` };
    const pos = e['pos'];
    if (
      !Array.isArray(pos) ||
      pos.length !== 2 ||
      typeof pos[0] !== 'number' ||
      typeof pos[1] !== 'number' ||
      !Number.isFinite(pos[0]) ||
      !Number.isFinite(pos[1])
    ) {
      return { kind: 'unsupported', detail: `${e['type']} without a numeric pos pair` };
    }
    return { kind: e['type'] === 'MouseDown' ? 'down' : 'up', x: pos[0], y: pos[1] };
  }
  return { kind: 'unsupported', detail: `type ${String(e['type'])}` };
}

/**
 * `numFrames` is the tick count from the TOML (null: use the Input_Group count). `source` names the
 * key it came from and is only used when `numFrames` is not null.
 */
export function planReplay(
  inputJson: string,
  numFrames: number | null,
  source: 'num_frames' | 'num_ticks' = 'num_frames',
): ReplayPlan | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(inputJson);
  } catch {
    return { error: 'invalid-input-json' };
  }
  if (!Array.isArray(parsed)) return { error: 'invalid-input-json' };

  const problems: PlanProblem[] = [];
  const clicks: PlannedClick[] = [];
  // groupFirst[k] is the index of the first entry in group k.
  const groupFirst: number[] = [];
  let group = 0;
  let groupStarted = false;
  let pending: { index: number; x: number; y: number } | null = null;

  for (let i = 0; i < parsed.length; i++) {
    if (!groupStarted) {
      groupFirst.push(i);
      groupStarted = true;
    }
    const entry = classify(parsed[i]);
    if (entry.kind === 'unsupported') {
      problems.push({ kind: 'unsupported-input', index: i, detail: entry.detail });
    } else if (entry.kind === 'down') {
      if (pending !== null) problems.push({ kind: 'unpaired-mouse-event', index: pending.index });
      pending = { index: i, x: entry.x, y: entry.y };
    } else if (entry.kind === 'up') {
      if (pending !== null && pending.x === entry.x && pending.y === entry.y) {
        clicks.push({ tick: group, x: entry.x, y: entry.y, downIndex: pending.index, upIndex: i });
      } else {
        if (pending !== null) problems.push({ kind: 'unpaired-mouse-event', index: pending.index });
        problems.push({ kind: 'unpaired-mouse-event', index: i });
      }
      pending = null;
    }
    // Wait and unsupported entries both end the group.
    if (entry.kind === 'wait' || entry.kind === 'unsupported') {
      group++;
      groupStarted = false;
    }
  }
  if (pending !== null) problems.push({ kind: 'unpaired-mouse-event', index: pending.index });

  const groupCount = groupStarted ? group + 1 : group;
  const tickCount = numFrames ?? groupCount;

  let planClicks = clicks;
  if (groupCount > tickCount) {
    problems.push({ kind: 'unused-input', index: groupFirst[tickCount]! });
    planClicks = clicks.filter((c) => c.tick < tickCount);
  }

  problems.sort((a, b) => a.index - b.index || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  const tickSource: TickSource = numFrames === null ? 'input-groups' : source;
  return { tickCount, tickSource, clicks: planClicks, problems };
}
