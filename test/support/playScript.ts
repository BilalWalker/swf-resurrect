// The one Input_Script builder per game (as3-coverage Requirement 26.6): the same script feeds the Ruffle recorder
// (samples/<name>/reference/input.json) and the Play_Test. Entries use Ruffle's input.json format; one Wait ends a tick.

export type ScriptEntry =
  | { type: 'Wait' }
  | { type: 'MouseMove'; pos: [number, number] }
  | { type: 'MouseDown' | 'MouseUp'; pos: [number, number]; btn: 'Left' }
  | { type: 'KeyDown' | 'KeyUp'; key: string | { Char: string } };

export interface PlayScript {
  /** Ticks the script covers (the `num_frames` of the options file). */
  ticks: number;
  entries: ScriptEntry[];
}

/** Places `events` at their ticks (several per tick keep their order) and ends each tick but the last with a Wait. */
export function scriptFromTicks(ticks: number, events: ReadonlyArray<readonly [number, ScriptEntry]>): PlayScript {
  const entries: ScriptEntry[] = [];
  for (let t = 0; t < ticks; t++) {
    for (const [at, e] of events) if (at === t) entries.push(e);
    if (t < ticks - 1) entries.push({ type: 'Wait' });
  }
  return { ticks, entries };
}

/**
 * entity_game (Asteroids): click the stage to start, hold ArrowLeft (turn) and ArrowUp (thrust),
 * fire with Space, release everything at the end.
 */
export function entityGameScript(): PlayScript {
  const at = { x: 400, y: 300 } as const;
  return scriptFromTicks(60, [
    [2, { type: 'MouseMove', pos: [at.x, at.y] }],
    [2, { type: 'MouseDown', pos: [at.x, at.y], btn: 'Left' }],
    [3, { type: 'MouseUp', pos: [at.x, at.y], btn: 'Left' }],
    [5, { type: 'KeyDown', key: 'ArrowLeft' }],
    [5, { type: 'KeyDown', key: 'ArrowUp' }],
    [10, { type: 'KeyDown', key: 'Space' }],
    [50, { type: 'KeyUp', key: 'Space' }],
    [55, { type: 'KeyUp', key: 'ArrowUp' }],
    [55, { type: 'KeyUp', key: 'ArrowLeft' }],
  ]);
}

const SCRIPTS: Record<string, () => PlayScript> = { entity_game: entityGameScript };

export function playScript(game: string): PlayScript {
  const make = SCRIPTS[game];
  if (make === undefined) throw new Error(`no Input_Script for ${game}`);
  return make();
}

/** The committed text of samples/<game>/reference/input.json. */
export function serialiseScript(script: PlayScript): string {
  return `${JSON.stringify(script.entries, null, 2)}\n`;
}

/** The committed text of samples/<game>/reference/test.toml. */
export function scriptOptions(script: PlayScript): string {
  return `num_frames = ${script.ticks}\n`;
}
