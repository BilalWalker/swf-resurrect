import { Application } from 'pixi.js';
import { ManualClock } from '../runtime/clock';
import type { LoadedScene } from '../runtime/loader';
import { Player } from '../runtime/player';
import type { PixiBackend } from '../runtime/pixi/pixiBackend';

export interface TimelineOnlyOutcome {
  ready: boolean;
  frame: number;
  png: string | null;
  error: string | null;
}

declare global {
  interface Window {
    __swfResurrect?: TimelineOnlyOutcome | { ready: false; error: string };
  }
}

/**
 * '?timelineOnly=<n>' gives n; no parameter gives null; a present parameter that is
 * not an integer >= 1 gives NaN. Pure.
 */
export function parseTimelineOnly(search: string): number | null {
  const params = new URLSearchParams(search);
  if (!params.has('timelineOnly')) return null;
  const raw = (params.get('timelineOnly') ?? '').trim();
  if (!/^\d+$/.test(raw)) return Number.NaN;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : Number.NaN;
}

function fail(backend: PixiBackend, frame: number, message: string): void {
  window.__swfResurrect = { ready: false, frame, png: null, error: message };
  backend.showError(message);
}

/**
 * Draws the root timeline at frame `frame` with no translated code: an empty class
 * registry makes every clip a plain MovieClip. Reports through window.__swfResurrect.
 */
export async function runTimelineOnly(
  loaded: LoadedScene,
  backend: PixiBackend,
  frame: number,
): Promise<void> {
  const { scene, shapeBounds } = loaded;
  const rootSymbol = scene.symbols[String(scene.rootSymbolId)];
  const frameCount = rootSymbol !== undefined && rootSymbol.type === 'sprite' ? rootSymbol.frameCount : 0;
  if (Number.isNaN(frame) || frame < 1 || frame > frameCount) {
    fail(backend, frame, `timelineOnly frame must be an integer from 1 to ${frameCount}`);
    return;
  }

  const app = new Application();
  await app.init({
    width: scene.stage.width,
    height: scene.stage.height,
    background: scene.stage.backgroundColor,
    antialias: true,
    resolution: 1,
    autoDensity: false,
    preserveDrawingBuffer: true,
    autoStart: false,
  });
  document.body.appendChild(app.canvas);

  const clock = new ManualClock();
  const player = new Player({ scene, backend, clock, classRegistry: {}, shapeBounds });
  for (let i = 1; i < frame; i++) {
    clock.advance(player.frameIntervalMs);
    player.update();
  }
  if (player.root.currentFrame !== frame) {
    fail(backend, frame, `root is at frame ${player.root.currentFrame}, expected ${frame}`);
    return;
  }

  app.stage.addChild(player.rootNode as Parameters<typeof app.stage.addChild>[0]);
  app.render();
  window.__swfResurrect = {
    ready: true,
    frame,
    png: app.canvas.toDataURL('image/png'),
    error: null,
  };
}
