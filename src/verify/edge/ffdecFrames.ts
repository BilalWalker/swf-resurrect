/** Reference frames from FFDec (design section 3). */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnFfdec, type FfdecSpawner } from '../../unpack/spawnFfdec';
import type { RgbaImage } from '../core/pixelDiff';
import { decodePng } from './png';

export const FFDEC_FRAMES_TIMEOUT_MS = 120_000;

/** Per-frame outcome: an image, or the reason no usable reference exists. */
export type ReferenceFrame =
  | RgbaImage
  | { missing: string }
  | { sizeMismatch: { width: number; height: number } };

export interface ExportReferenceFramesInput {
  swfPath: string;
  jarPath: string;
  /** 1-based frame numbers. */
  frames: readonly number[];
  workDir: string;
  /** When given, a decoded PNG of another size becomes `{ sizeMismatch }`. */
  stage?: { width: number; height: number };
  javaCommand?: string;
  spawner?: FfdecSpawner;
}

/**
 * Exports the given frames with `-format frame:png -select a,b,c -export frame`.
 * FFDec writes `<workDir>/<n>.png` (1-based). Never throws for FFDec problems:
 * every affected frame gets `{ missing }` and other frames are unaffected.
 */
export async function exportReferenceFrames(
  input: ExportReferenceFramesInput,
): Promise<Map<number, ReferenceFrame>> {
  const result = new Map<number, ReferenceFrame>();
  if (input.frames.length === 0) return result;
  const run = input.spawner ?? spawnFfdec;
  let failure: string | null = null;
  try {
    await run({
      javaCommand: input.javaCommand ?? 'java',
      jarPath: input.jarPath,
      args: [
        '-format',
        'frame:png',
        '-select',
        input.frames.join(','),
        '-export',
        'frame',
        input.workDir,
        input.swfPath,
      ],
      timeoutMs: FFDEC_FRAMES_TIMEOUT_MS,
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }
  for (const n of input.frames) {
    if (failure !== null) {
      result.set(n, { missing: failure });
      continue;
    }
    let image: RgbaImage;
    try {
      image = decodePng(await readFile(path.join(input.workDir, `${n}.png`)));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      result.set(n, { missing: code === 'ENOENT' ? `${n}.png was not written` : `${n}.png is not readable` });
      continue;
    }
    const s = input.stage;
    if (s && (image.width !== s.width || image.height !== s.height)) {
      result.set(n, { sizeMismatch: { width: image.width, height: image.height } });
    } else {
      result.set(n, image);
    }
  }
  return result;
}
