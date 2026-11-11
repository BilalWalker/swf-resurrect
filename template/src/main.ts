import { Application } from 'pixi.js';
import type { ShapeBounds } from '../runtime/backend';
import { Player } from '../runtime/player';
import { PixiBackend } from '../runtime/pixi/pixiBackend';
import { parseScene, type SceneJson } from '../runtime/scene';
import { classRegistry } from './classes';

const SCENE_URL = 'assets/scene.json';

/** True when any placement in the scene has a non-zero colour offset. */
function hasColorOffsets(scene: SceneJson): boolean {
  for (const sym of Object.values(scene.symbols)) {
    if (sym.type !== 'sprite') continue;
    for (const frame of sym.frames) {
      for (const entry of frame) {
        const ct = entry.colorTransform;
        if (ct[4] !== 0 || ct[5] !== 0 || ct[6] !== 0 || ct[7] !== 0) return true;
      }
    }
  }
  return false;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function boot(): Promise<void> {
  const backend = new PixiBackend();

  // Scene_JSON: on any failure show the error and render no frames (Req 6.6).
  let scene: SceneJson;
  try {
    scene = parseScene(await fetchText(SCENE_URL));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    backend.showError(`Scene_JSON failed to load (${SCENE_URL}): ${detail}`);
    return;
  }

  // Shapes: any failure names the asset and playback never starts (Req 6.7).
  const shapeBounds = new Map<number, ShapeBounds>();
  for (const [key, sym] of Object.entries(scene.symbols)) {
    if (sym.type !== 'shape') continue;
    const id = Number(key);
    try {
      const svg = await fetchText(`assets/${sym.file}`);
      shapeBounds.set(id, await backend.loadShape(id, svg, sym.origin));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      backend.showError(`SVG asset ${sym.file} failed to load: ${detail}`);
      return;
    }
  }

  if (hasColorOffsets(scene)) backend.warnColorOffsetsUnsupported();

  const app = new Application();
  await app.init({
    width: scene.stage.width,
    height: scene.stage.height,
    background: scene.stage.backgroundColor,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    autoStart: false, // rendering is driven by the loop below
  });
  document.body.appendChild(app.canvas);

  const player = new Player({
    scene,
    backend,
    clock: { now: () => performance.now() },
    classRegistry,
    shapeBounds,
  });
  app.stage.addChild(player.rootNode as Parameters<typeof app.stage.addChild>[0]);

  // Canvas pixels to stage coordinates; the canvas may be scaled by CSS.
  app.canvas.addEventListener('pointerdown', (ev: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((ev.clientX - rect.left) * scene.stage.width) / rect.width;
    const y = ((ev.clientY - rect.top) * scene.stage.height) / rect.height;
    player.dispatchClick(x, y);
  });

  const loop = (): void => {
    player.update();
    app.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  new PixiBackend().showError(`Startup failed: ${message}`);
});
