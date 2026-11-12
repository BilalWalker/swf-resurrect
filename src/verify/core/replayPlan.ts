// Pure Replay planning (design section 6): Input_Groups, pointer entries, tick count.

export type PlanProblem =
  | { kind: 'unpaired-mouse-event'; index: number }
  | { kind: 'unsupported-input'; index: number; detail: string }
  | { kind: 'unused-input'; index: number };

export type PointerKind = 'move' | 'down' | 'up';

export interface PlannedPointer {
  tick: number;
  kind: PointerKind;
  x: number;
  y: number;
  /** Index of the Reference_Input entry. */
  index: number;
  /** A MouseUp with the button up, or a MouseDown with the button already down (14.9). */
  unpaired: boolean;
}

export type TickSource = 'num_frames' | 'num_ticks' | 'input-groups';

export interface ReplayPlan {
  tickCount: number;
  tickSource: TickSource;
  pointers: PlannedPointer[];
  /** MouseUp entries that followed a MouseDown (report field `clicks`). */
  pressReleasePairs: number;
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
  | { kind: 'move' | 'down' | 'up'; x: number; y: number }
  | { kind: 'unsupported'; detail: string };

function classify(raw: unknown): Entry {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { kind: 'unsupported', detail: 'entry is not an object' };
  }
  const e = raw as Record<string, unknown>;
  if (e['type'] === 'Wait') return { kind: 'wait' };
  if (e['type'] === 'MouseDown' || e['type'] === 'MouseUp' || e['type'] === 'MouseMove') {
    if (e['type'] !== 'MouseMove' && e['btn'] !== 'Left') {
      return { kind: 'unsupported', detail: `button ${String(e['btn'])}` };
    }
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
    const kind = e['type'] === 'MouseDown' ? 'down' : e['type'] === 'MouseUp' ? 'up' : 'move';
    return { kind, x: pos[0], y: pos[1] };
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
  const pointers: PlannedPointer[] = [];
  // groupFirst[k] is the index of the first entry in group k.
  const groupFirst: number[] = [];
  let group = 0;
  let groupStarted = false;
  let buttonDown = false;

  for (let i = 0; i < parsed.length; i++) {
    if (!groupStarted) {
      groupFirst.push(i);
      groupStarted = true;
    }
    const entry = classify(parsed[i]);
    if (entry.kind === 'unsupported') {
      problems.push({ kind: 'unsupported-input', index: i, detail: entry.detail });
    } else if (entry.kind !== 'wait') {
      let unpaired = false;
      if (entry.kind === 'down') {
        unpaired = buttonDown;
        buttonDown = true;
      } else if (entry.kind === 'up') {
        unpaired = !buttonDown;
        buttonDown = false;
      }
      if (unpaired) problems.push({ kind: 'unpaired-mouse-event', index: i });
      pointers.push({ tick: group, kind: entry.kind, x: entry.x, y: entry.y, index: i, unpaired });
    }
    // Wait and unsupported entries end the group; a MouseMove never does.
    if (entry.kind === 'wait' || entry.kind === 'unsupported') {
      group++;
      groupStarted = false;
    }
  }
  const groupCount = groupStarted ? group + 1 : group;
  const tickCount = numFrames ?? groupCount;

  let planPointers = pointers;
  if (groupCount > tickCount) {
    problems.push({ kind: 'unused-input', index: groupFirst[tickCount]! });
    planPointers = pointers.filter((p) => p.tick < tickCount);
  }

  problems.sort((a, b) => a.index - b.index || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  const tickSource: TickSource = numFrames === null ? 'input-groups' : source;
  const pressReleasePairs = planPointers.filter((p) => p.kind === 'up' && !p.unpaired).length;
  return { tickCount, tickSource, pointers: planPointers, pressReleasePairs, problems };
}
