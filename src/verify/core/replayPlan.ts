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

export interface ReplayPlan {
  tickCount: number;
  clicks: PlannedClick[];
  problems: PlanProblem[];
}

/** Reads the integer value of the `num_frames` key; null when absent or not a non-negative integer. */
export function parseNumFrames(tomlText: string | null): number | null {
  if (tomlText === null) return null;
  for (const raw of tomlText.split('\n')) {
    const m = /^\s*num_frames\s*=\s*(\d+)\s*(?:#.*)?$/.exec(raw.replace(/\r$/, ''));
    if (m !== null) return parseInt(m[1]!, 10);
  }
  return null;
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

export function planReplay(inputJson: string, numFrames: number | null): ReplayPlan | { error: string } {
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
  return { tickCount, clicks: planClicks, problems };
}
