import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import { serialiseScene } from '../../src/convert/sceneJson';
import { planEmitDetailed } from '../../src/emit/planEmit';
import type { TemplateFile } from '../../src/emit/planEmit';
import { planTranslate } from '../../src/translate/planTranslate';
import { buildReport } from '../../src/translate/report';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { typeCheckProject } from '../../src/translate/typeCheckGate';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
vi.setConfig({ testTimeout: 120_000 });

function readTemplates(dir = join(repoRoot, 'template'), prefix = ''): TemplateFile[] {
  const out: TemplateFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTemplates(full, `${prefix}${name}/`));
    else out.push({ path: `${prefix}${name}`, content: readFileSync(full, 'utf8') });
  }
  return out;
}

const sprite = (className: string) => ({ type: 'sprite' as const, className, frameCount: 1, labels: [], frames: [[]] });
const sceneOf = (...names: string[]): SceneJson => ({
  formatVersion: 1,
  stage: { width: 550, height: 400, backgroundColor: '#ffffff', frameRate: 24 },
  rootSymbolId: 0,
  symbols: Object.fromEntries(names.map((n, i) => [String(i), sprite(n)])),
});

function build(source: string, scene: SceneJson) {
  const artifact = planTranslate([{ className: 'Main', source }], scene, tsSyntaxCheck);
  const plan = planEmitDetailed(
    { scene, sceneJson: serialiseScene(scene), templates: readTemplates(), translated: artifact.classes, handwritten: [] },
    [],
  );
  const gate = typeCheckProject({ files: new Map(plan.files.map((f) => [f.path, f.content])), repoRoot });
  const report = buildReport(
    artifact.classes.map((c) => ({
      className: c.className,
      overridden: false,
      path: plan.classPaths.find((p) => p.className === c.className)?.path,
      diagnostics: c.diagnostics,
    })),
    gate,
    { classPaths: plan.classPaths },
  );
  return { plan, gate, report };
}

describe('class Main next to the Boot_File (Requirement 6.6)', () => {
  it('emits Main without TS 1261 or 2305', () => {
    const { plan, gate } = build('package {\n  public class Main {\n    public var n:int = 1;\n  }\n}\n', sceneOf('Main'));
    expect(plan.files.some((f) => f.path === 'src/Main.class.ts')).toBe(true);
    expect(plan.files.some((f) => f.path === 'src/Main.ts')).toBe(false);
    expect(gate.errors.filter((e) => e.code === 1261 || e.code === 2305)).toEqual([]);
  });

  it('registers a Main that extends Sprite under the key Main and type-checks clean', () => {
    const { plan, gate, report } = build(
      'package {\n  import flash.display.Sprite;\n  public class Main extends Sprite {\n    public function Main() {\n      super();\n    }\n  }\n}\n',
      sceneOf('Main'),
    );
    const classes = plan.files.find((f) => f.path === 'src/classes.ts')?.content ?? '';
    expect(classes).toContain("import { Main } from './Main.class';");
    expect(classes).toContain('"Main": Main,');
    expect(report.omittedClasses).toEqual([]);
    expect(report.typeCheck).toBe('ran');
    expect(gate.errors).toEqual([]);
    expect(report.otherErrors).toEqual([]);
  });
});
