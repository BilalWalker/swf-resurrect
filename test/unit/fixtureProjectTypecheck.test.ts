import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { serialiseScene } from '../../src/convert/sceneJson';
import { planEmitDetailed, type TemplateFile } from '../../src/emit/planEmit';
import { planTranslate, type ScriptSource } from '../../src/translate/planTranslate';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';
import { typeCheckProject } from '../../src/translate/typeCheckGate';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const templateDir = join(repoRoot, 'template');

function readTree(dir: string, prefix = ''): TemplateFile[] {
  const out: TemplateFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readTree(full, `${prefix}${name}/`));
    else out.push({ path: `${prefix}${name}`, content: readFileSync(full, 'utf8') });
  }
  return out;
}

async function buildProject(sample: string): Promise<Map<string, string>> {
  const fixture = resolve(repoRoot, 'test/fixtures', sample);
  const scriptsDir = resolve(fixture, 'scripts');
  const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(fixture, 'structure.xml'), 'utf8'));
  const model = await readUnpacked({
    workDir: fixture,
    shapesDir: resolve(fixture, 'shapes'),
    structureDumpPath: resolve(fixture, 'structure.xml'),
    symbolClassPath: resolve(fixture, 'symbols.csv'),
    scriptsDir,
    header,
    xmlVersion,
  });
  const scene = convertModel(model).scene;

  const sources: ScriptSource[] = readdirSync(scriptsDir)
    .filter((f) => f.endsWith('.as'))
    .sort()
    .map((f) => ({ className: f.slice(0, -3), source: readFileSync(resolve(scriptsDir, f), 'utf8') }));
  const artifact = planTranslate(sources, scene, tsSyntaxCheck);

  const { files } = planEmitDetailed(
    {
      scene,
      sceneJson: serialiseScene(scene),
      templates: readTree(templateDir),
      translated: artifact.classes,
      handwritten: [],
    },
    [],
  );
  return new Map(files.map((f) => [f.path, f.content]));
}

// Each case builds a full TypeScript program (lib.dom + pixi types); allow time under load.
vi.setConfig({ testTimeout: 120_000 });

describe('fixture project type-check (no Java)', () => {
  for (const sample of ['clickgoto', 'tweendemo']) {
    it(`${sample}: translated classes and template type-check with 0 errors`, async () => {
      const files = await buildProject(sample);
      const { errors } = typeCheckProject({ files, repoRoot });
      if (errors.length > 0) console.error(JSON.stringify(errors, null, 2));
      expect(errors).toEqual([]);
    });
  }
});
