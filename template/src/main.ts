import { Application } from 'pixi.js';
import { loadScene } from '../runtime/loader';
import { canvasToStage } from '../runtime/canvasToStage';
import { flashKeyCode, preventsDefault } from '../runtime/keyMap';
import { ManualClock } from '../runtime/clock';
import type { Inspection } from '../runtime/inspect';
import { Player } from '../runtime/player';
import { KeyboardEvent } from '../shim';
import { setTextMeasure } from '../shim/textMeasure';
import { PixiBackend } from '../runtime/pixi/pixiBackend';
import { classRegistry } from './classes';
import { parseTimelineOnly, runTimelineOnly } from './timelineOnly';

declare global {
  interface Window {
    /** Present only with ?play=1 (Play_Tests). */
    __swfPlay?: {
      step(n: number): void;
      key(type: 'keyDown' | 'keyUp', code: number): void;
      click(x: number, y: number): void;
      inspect(): Inspection;
      errors(): Array<{ site: string; message: string }>;
    };
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function boot(): Promise<void> {
  // TextField.textWidth is measured in the browser (Named_Limit device-font-metrics).
  const measureContext = document.createElement('canvas').getContext('2d');
  if (measureContext !== null) {
    setTextMeasure((text, font) => {
      measureContext.font = font;
      return measureContext.measureText(text).width;
    });
  }
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

  // ?play=1 (Play_Tests, as3-coverage Requirement 25.7): a manual clock and no requestAnimationFrame loop; the test steps.
  const play = new URLSearchParams(window.location.search).get('play') === '1';
  const manual = new ManualClock();
  const errors: Array<{ site: string; message: string }> = [];
  const player = new Player({
    scene,
    backend,
    clock: play ? manual : { now: () => performance.now() },
    classRegistry,
    shapeBounds,
    ...(play ? { onCaughtError: (e: { site: string; message: string }) => void errors.push({ site: e.site, message: e.message }) } : {}),
  });
  app.stage.addChild(player.stageNode as Parameters<typeof app.stage.addChild>[0]);

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

  // Keyboard (as3-coverage D4): the listener is on window, not the canvas. Each browser repeat is a further keyDown.
  const onKey = (type: typeof KeyboardEvent.KEY_DOWN | typeof KeyboardEvent.KEY_UP) => (ev: globalThis.KeyboardEvent): void => {
    const code = flashKeyCode(ev);
    if (code === null) return;
    if (preventsDefault(code)) ev.preventDefault();
    player.dispatchKey(type, code);
  };
  window.addEventListener('keydown', onKey(KeyboardEvent.KEY_DOWN));
  window.addEventListener('keyup', onKey(KeyboardEvent.KEY_UP));
  // Focus: a page inside an iframe gets key events only once the frame has focus. A click in the frame focuses it;
  // window.focus() on pointerdown and the focusable canvas on load keep that true when the parent does not focus it.
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  canvas.addEventListener('pointerdown', () => {
    window.focus();
    canvas.focus({ preventScroll: true });
  });
  window.focus();
  canvas.focus({ preventScroll: true });

  if (play) {
    let steps = 0;
    window.__swfPlay = {
      step: (n: number): void => {
        for (let i = 0; i < n; i++) {
          manual.advance(player.frameIntervalMs);
          player.update();
          if (++steps % 60 === 0) app.render();
        }
        app.render();
      },
      key: (type: 'keyDown' | 'keyUp', code: number): void => player.dispatchKey(type === 'keyDown' ? KeyboardEvent.KEY_DOWN : KeyboardEvent.KEY_UP, code),
      click: (x: number, y: number): void => player.dispatchClick(x, y),
      inspect: (): Inspection => player.inspect(),
      errors: (): Array<{ site: string; message: string }> => errors.slice(),
    };
    return;
  }
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
