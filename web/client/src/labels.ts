// Words shown in the UI: the ritual names of the stages (always next to the real stage name)
// and plain explanations of the report's reason codes.
import type { StageKey, StageStatus } from '../../shared/api';

export const RITES: Record<StageKey, { rite: string; what: string }> = {
  unpack: { rite: 'Exhume', what: 'FFDec takes the SWF apart.' },
  convert: { rite: 'Dissect', what: 'Shapes, sprites and the timeline become SVG and JSON.' },
  translate: { rite: 'Translate the dead tongue', what: 'ActionScript 3 becomes TypeScript.' },
  emit: { rite: 'Stitch', what: 'The Vite + PixiJS project is written.' },
  typecheck: { rite: 'Check the vitals', what: 'The emitted project is type-checked.' },
  verify: { rite: 'Seance', what: 'The result is compared with the original, frame by frame and trace by trace.' },
  build: { rite: 'Raise', what: 'This server builds the project for the preview.' },
};

/** The line icon of each stage (brief 3 mockup); decorative, the stage name is always written. */
export const STAGE_ICONS: Record<StageKey, string> = {
  unpack: 'coffin',
  convert: 'bones',
  translate: 'book',
  emit: 'needle',
  typecheck: 'heartbeat',
  verify: 'crystal-ball',
  build: 'hand',
};

export const STATUS_TEXT: Record<StageStatus, string> = {
  pending: 'waiting',
  running: 'in progress',
  ok: 'done',
  warn: 'done, with type errors',
  failed: 'failed',
  refused: 'refused here',
  skipped: 'not reached',
};

const REASONS: Record<string, string> = {
  'no-reference-trace': 'No reference trace was recorded for this SWF, so its behaviour could not be compared.',
  'no-reference-input': 'No recorded input exists to replay against the converted project.',
  'invalid-input-json': 'The recorded input file could not be read.',
  'trace-too-large': 'The trace was too large to compare.',
  'replay-failed': 'Replaying the recorded input failed.',
  'tick-rate': 'The SWF sets a custom tick rate, so no replay was run.',
  'empty-reference-trace': 'The reference trace is empty.',
  'reference-unavailable': 'No reference frame could be rendered.',
  'size-mismatch': 'Reference and converted frames differ in size.',
  'render-failed': 'A frame could not be rendered.',
  'no-frames-compared': 'No frames were compared.',
  unknown: 'The report gives no reason.',
};

export function reasonText(code: string): string {
  return REASONS[code] ?? 'See the fidelity report for details.';
}

/**
 * What a file must be and how long it takes, from the server's own limits. Small samples convert in
 * 10 to 30 s here; a 9 MB game took about 130 s without Verify on the development machine.
 */
export function uploadLimits(maxMb: number, timeoutSeconds: number): string {
  const limit = timeoutSeconds >= 120 && timeoutSeconds % 60 === 0 ? `${timeoutSeconds / 60} min` : `${timeoutSeconds} s`;
  return `ActionScript 3 .swf, up to ${maxMb} MB. Usually under a minute, at most ${limit}.`;
}
