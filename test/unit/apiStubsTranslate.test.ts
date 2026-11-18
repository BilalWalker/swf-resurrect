// Fixture_Class that calls stub members: it translates, passes the type-check gate, and its first call
// records one Named_Limit (robustness task 14.3, Requirements 17.1, 17.2, 17.3, 17.11).
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { serialiseScene } from '../../src/convert/sceneJson';
import { planEmitDetailed } from '../../src/emit/planEmit';
import type { TemplateFile } from '../../src/emit/planEmit';
import { planTranslate } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { typeCheckProject } from '../../src/translate/typeCheckGate';
import type { SceneJson } from '../../template/runtime/scene';
import { takeNamedLimits } from '../../template/shim/errorSink';

vi.setConfig({ testTimeout: 120_000 });
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const workDir = join(repoRoot, '.work', 'apiStubsTranslate');

function readTemplates(dir = join(repoRoot, 'template'), prefix = ''): TemplateFile[] {
  const out: TemplateFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTemplates(full, `${prefix}${name}/`));
    else out.push({ path: `${prefix}${name}`, content: readFileSync(full, 'utf8') });
  }
  return out;
}

const FIXTURE = `package {
  import flash.display.Sprite;
  import flash.media.Sound;
  import flash.media.SoundChannel;
  import flash.media.SoundTransform;
  import flash.net.URLRequest;
  import flash.net.navigateToURL;
  import flash.net.SharedObject;
  public class StubGame extends Sprite {
    public function StubGame() {
    }
    public function go():Number {
      var s:Sound = new Sound();
      var ch:SoundChannel = s.play();
      ch.soundTransform = new SoundTransform(0.5);
      navigateToURL(new URLRequest("http://example.invalid/"));
      var so:SharedObject = SharedObject.getLocal("save");
      so.data.score = 3;
      return ch.position + so.data.score;
    }
  }
}
`;

const scene: SceneJson = {
  formatVersion: 2,
  stage: { width: 550, height: 400, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: { '0': { type: 'sprite', className: 'StubGame', frameCount: 1, labels: [], frames: [[]] } },
};

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe('Fixture_Class that calls stub members', () => {
  const artifact = planTranslate([{ className: 'StubGame', source: FIXTURE }], scene, tsSyntaxCheck);
  const game = artifact.classes.find((c) => c.className === 'StubGame')!;

  it('translates with the stub classes imported from the Shim and no diagnostic', () => {
    expect(game.diagnostics).toEqual([]);
    for (const n of ['Sound', 'SoundChannel', 'SoundTransform', 'URLRequest', 'navigateToURL', 'SharedObject']) {
      expect(game.text, n).toMatch(new RegExp(`import \\{[^}]*\\b${n}\\b[^}]*\\} from '\\.\\./shim'`));
    }
  });

  it('type-checks in the emitted project with zero errors', () => {
    const plan = planEmitDetailed(
      { scene, sceneJson: serialiseScene(scene), templates: readTemplates(), translated: artifact.classes, handwritten: [] },
      [],
    );
    const { errors } = typeCheckProject({ files: new Map(plan.files.map((f) => [f.path, f.content])), repoRoot });
    expect(errors).toEqual([]);
  });

  it('records one Named_Limit per stub member however often it is called (once per run)', async () => {
    mkdirSync(workDir, { recursive: true });
    const shimIndex = pathToFileURL(join(repoRoot, 'template', 'shim', 'index.ts')).href;
    const file = join(workDir, 'StubGame.ts');
    writeFileSync(file, game.text.replace(/from '\.\.\/shim'/g, `from '${shimIndex}'`));
    const mod = (await import(pathToFileURL(file).href)) as { StubGame: new () => { go(): number } };
    const g = new mod.StubGame();
    takeNamedLimits();
    expect(g.go()).toBe(3);
    expect(g.go()).toBe(3);
    const first = takeNamedLimits().map((l) => l.id);
    for (const id of ['api-stub:Sound.play', 'api-stub:SoundChannel.soundTransform', 'api-stub:navigateToURL', 'api-stub:SharedObject.getLocal', 'api-stub:SoundChannel.position']) {
      expect(first.filter((i) => i === id), id).toHaveLength(1);
    }
    expect(first.length).toBe(new Set(first).size);
    expect(first).toContain('api-stub-no-event:Sound');
    expect(takeNamedLimits()).toEqual([]);
  });
});
