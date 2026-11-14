import { Application } from 'pixi.js';
import { loadScene } from '../runtime/loader';
import { canvasToStage } from '../runtime/canvasToStage';
import { Player } from '../runtime/player';
import { PixiBackend } from '../runtime/pixi/pixiBackend';
import { classRegistry } from './classes';
import { parseTimelineOnly, runTimelineOnly } from './timelineOnly';

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function boot(): Promise<void> {
  const backend = new PixiBackend();

  // Req 6.6 and 6.7: on failure an error is shown and no frame is rendered.
  const loaded = await loadScene(fetchText, backend);
  if (loaded === null) {
    // 25.6: a load error is the only startup failure. loadScene has put the reason in the alert; keep it and name the stage.
    const reason = document.getElementById('swf-resurrect-error')?.textContent ?? 'the scene or an asset could not be loaded';
    backend.showError(`Startup failed: ${reason}`);
    return;
  }
  const only = parseTimelineOnly(window.location.search);
  if (only !== null) {
    await runTimelineOnly(loaded, backend, only);
    return;
  }
  const { scene, shapeBounds } = loaded;

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

  // Pointer events cover mouse, touch and pen. Canvas pixels map to stage coordinates; the canvas may be
  // scaled by CSS. touch-action none keeps a touch drag from scrolling the page and cancelling the pointer.
  const canvas = app.canvas;
  canvas.style.touchAction = 'none';
  const toStage = (ev: PointerEvent): { x: number; y: number } | null =>
    canvasToStage(ev, canvas.getBoundingClientRect(), scene.stage);
  canvas.addEventListener('pointermove', (ev: PointerEvent) => {
    const p = toStage(ev);
    if (p !== null) player.dispatchMouseMove(p.x, p.y);
  });
  canvas.addEventListener('pointerdown', (ev: PointerEvent) => {
    const p = toStage(ev);
    if (p === null) return;
    // Capture so a release outside the canvas still reaches pointerup (a release-outside for the Player).
    canvas.setPointerCapture?.(ev.pointerId);
    player.dispatchMouseDown(p.x, p.y);
  });
  canvas.addEventListener('pointerup', (ev: PointerEvent) => {
    const p = toStage(ev);
    if (p !== null) player.dispatchMouseUp(p.x, p.y);
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
  if (parseTimelineOnly(window.location.search) !== null) {
    window.__swfResurrect = { ready: false, error: message };
  }
  new PixiBackend().showError(`Startup failed: ${message}`);
});
