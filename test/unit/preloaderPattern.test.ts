// The preloader pattern (robustness task 31.3, Requirement 27.7, design D-E2): a two-frame file whose document class
// stops, waits, calls nextFrame() and creates the main class by name. The AS3 is Fixture_Class text translated by the
// real Translator (there is no AS3 compiler here); the Player runs it on the FakeBackend with a manual clock.
// Validates: Requirements 27.5, 27.6, 27.7
import { describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { parseStructure } from '../../src/convert/ffdecXml';
import type { TagsModel } from '../../src/convert/model';
import { planEmitDetailed } from '../../src/emit/planEmit';
import { planTranslate } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { ManualClock } from '../../template/runtime/clock';
import { Player } from '../../template/runtime/player';
import type { SceneJson, SpriteSymbol } from '../../template/runtime/scene';
import * as shim from '../../template/shim/index';
import { MovieClip } from '../../template/shim/MovieClip';
import { getDefinitionByName, registerDefinitions } from '../../template/shim/utils';
import { evalTranslated } from '../support/evalTranslated';
import { FakeBackend } from '../support/fakeBackend';
import { dumpPreloaderSwf, PRELOADER, preloaderSwfSkipReason } from '../support/preloaderSwf';

const PRELOADER_AS = `package {
  import flash.display.MovieClip;
  import flash.events.Event;
  import flash.utils.getDefinitionByName;
  public class Preloader extends MovieClip {
    private var waited:int = 0;
    private var mainName:String = "Main";
    public function Preloader() {
      stop();
      addEventListener(Event.ENTER_FRAME, onEnterFrame);
    }
    private function onEnterFrame(e:Event):void {
      waited++;
      if (waited < 3) {
        return;
      }
      removeEventListener(Event.ENTER_FRAME, onEnterFrame);
      if (framesLoaded == totalFrames) {
        nextFrame();
        var mainClass:Class = getDefinitionByName(mainName) as Class;
        addChild(new mainClass() as MovieClip);
      }
    }
  }
}
`;
const MAIN_AS = `package {
  import flash.display.MovieClip;
  public class Main extends MovieClip {
    public function Main() {
      super();
    }
  }
}
`;
// Main has no symbol and no import from the Preloader: only the string "Main" (kept in a field) reaches it.
const SOURCES = [
  { className: 'Preloader', source: PRELOADER_AS },
  { className: 'Main', source: MAIN_AS },
];
const sprite = (frameCount: number, className?: string): SpriteSymbol => ({
  type: 'sprite',
  frameCount,
  frames: Array.from({ length: frameCount }, () => []),
  labels: [],
  ...(className === undefined ? {} : { className }),
});
const scene: SceneJson = {
  formatVersion: 3,
  stage: { width: 100, height: 100, backgroundColor: '#ffffff', frameRate: 10 },
  rootSymbolId: 0,
  symbols: { '0': sprite(2, 'Preloader') },
};

type Ctor = new () => MovieClip;
function loadClasses(): Record<string, Ctor> {
  const plan = planTranslate(SOURCES, scene, tsSyntaxCheck);
  const texts = new Map(plan.classes.map((c) => [c.className, c.text]));
  const loaded: Record<string, Record<string, unknown>> = {};
  const shimModule = shim as Record<string, unknown>;
  const load = (name: string): Record<string, unknown> =>
    (loaded[name] ??= evalTranslated(
      texts.get(name) as string,
      new Proxy({}, { has: () => true, get: (_t, spec: string) => (spec.endsWith('shim') ? shimModule : load(spec.replace('./', ''))) }),
    ));
  const out: Record<string, Ctor> = {};
  for (const name of texts.keys()) out[name] = load(name)[name] as Ctor;
  return out;
}

function run(): { player: Player; clock: ManualClock; tick: () => void; classes: Record<string, Ctor> } {
  const classes = loadClasses();
  registerDefinitions(classes); // what the emitted classes.ts does before the Player is constructed
  const clock = new ManualClock();
  const player = new Player({ scene, backend: new FakeBackend(), clock, classRegistry: { Preloader: classes.Preloader }, shapeBounds: new Map() });
  return {
    player,
    clock,
    classes,
    tick: () => {
      clock.advance(100);
      player.update();
    },
  };
}

describe('the preloader pattern runs (rule (b) reaches the main class)', () => {
  it('Translate reaches the main class by its name, and classes.ts registers it', () => {
    const plan = planTranslate(SOURCES, scene, tsSyntaxCheck);
    expect(plan.classes.map((c) => c.className)).toEqual(['Main', 'Preloader']);
    const emitted = planEmitDetailed({ scene, sceneJson: '{}', templates: [], translated: plan.classes, handwritten: [] }, []);
    const classesTs = emitted.files.find((f) => f.path === 'src/classes.ts')?.content ?? '';
    expect(classesTs).toContain('registerDefinitions({');
    expect(classesTs).toContain('"Main": Main,');
  });

  it('the main class is on the display list after the frame that called nextFrame(), not before', () => {
    const { player, tick, classes } = run();
    const root = player.root as MovieClip;
    expect(root.currentFrame).toBe(1);
    tick();
    tick();
    expect(root.numChildren).toBe(0);
    expect(root.currentFrame).toBe(1);
    tick();
    expect(root.currentFrame).toBe(2);
    expect(root.numChildren).toBe(1);
    const main = root.getChildAt(0);
    expect(main).toBeInstanceOf(classes.Main);
    expect((main as MovieClip).visible).toBe(true);
  });

  it('the document class is bound to the root and the root stays stopped on frame 2', () => {
    const { player, classes, tick } = run();
    expect(player.root).toBeInstanceOf(classes.Preloader);
    for (let i = 0; i < 6; i++) tick();
    expect((player.root as MovieClip).currentFrame).toBe(2);
    expect((player.root as MovieClip).numChildren).toBe(1);
  });

  it('nextFrame() stops at the last frame, and framesLoaded is the frame count (Ruffle next_frame, frames_loaded)', () => {
    const { player } = run();
    const root = player.root as MovieClip;
    expect(root.framesLoaded).toBe(2);
    root.nextFrame();
    root.nextFrame();
    expect(root.currentFrame).toBe(2);
  });

  // Open_Item (design D-E2): Ruffle fills the lookup frame by frame, so a lookup on frame 1 of a class linked in frame 2 throws
  // #1065 there. The registry is filled before the Player is constructed, so it succeeds here. Scene_JSON does not carry the
  // frame of a SymbolClass pair, so the lookup is not gated; this test records the known difference.
  it('a lookup on frame 1 succeeds here although Ruffle throws until frame 2 (known difference)', () => {
    const { classes } = run();
    expect(getDefinitionByName('Main')).toBe(classes.Main);
  });
});

describe.skipIf(preloaderSwfSkipReason() !== null)('the generated two-frame SWF (Convert side)', () => {
  it('links the document class in frame 1 and the main class by the SymbolClass pair of frame 2', () => {
    const dump = dumpPreloaderSwf();
    const structure = parseStructure(dump);
    expect(structure.symbolClassPairs).toEqual([
      { id: 0, className: PRELOADER.documentClass },
      { id: PRELOADER.main, className: PRELOADER.mainClass },
    ]);
    const svg = '<svg width="10px" height="10px"><g transform="matrix(1,0,0,1,0,0)"><path d="M0 0"/></g></svg>';
    const model: TagsModel = {
      xmlVersion: { major: 4, minor: 2 },
      header: { widthPx: 200, heightPx: 200, frameRate: 24, frameCount: 2 },
      background: structure.background,
      root: structure.root,
      sprites: structure.sprites,
      declaredShapeIds: structure.declaredShapeIds,
      morphShapeIds: structure.morphShapeIds,
      staticTextIds: structure.staticTextIds,
      bitmapIds: structure.bitmapIds,
      buttons: structure.buttons,
      scenes: structure.scenes,
      shapeAssets: [{ id: PRELOADER.shape, svg, origin: { x: 0, y: 0 } }],
      textAssets: [],
      symbolClasses: structure.symbolClassPairs,
      classSources: [],
      unsupported: structure.unsupported,
    };
    const converted = convertModel(model).scene;
    expect(converted.rootSymbolId).toBe(0);
    expect((converted.symbols['0'] as SpriteSymbol).className).toBe(PRELOADER.documentClass);
    expect((converted.symbols[String(PRELOADER.main)] as SpriteSymbol).className).toBe(PRELOADER.mainClass);
  }, 120_000);
});
