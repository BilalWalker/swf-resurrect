import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SceneJson } from '../../template/runtime/scene';
import type { ConvertedArtifact } from '../../src/convert/writeConverted';
import type { UnpackResult } from '../../src/unpack/unpack';
import { PipelineError } from '../../src/pipeline/errors';
import { DuplicateClassError, ScriptsDirError } from '../../src/translate/errors';
import { planTranslate } from '../../src/translate/planTranslate';
import { translateStage } from '../../src/translate/translateStage';
import { tsSyntaxCheck } from '../../src/translate/tsSyntaxCheck';

function sceneWith(classNames: string[]): SceneJson {
  const symbols: Record<string, unknown> = {};
  classNames.forEach((c, i) => {
    symbols[String(i)] = { type: 'sprite', frames: [], labels: {}, className: c };
  });
  return { formatVersion: 1, rootSymbolId: 0, symbols } as unknown as SceneJson;
}

const cls = (name: string, base?: string) =>
  `package {\n  public class ${name}${base ? ` extends ${base}` : ''} {\n    public function ${name}() {\n    }\n  }\n}\n`;

describe('planTranslate', () => {
  it('adds the base class of a linked class', () => {
    const r = planTranslate(
      [
        { className: 'A', source: cls('A', 'B') },
        { className: 'B', source: cls('B') },
      ],
      sceneWith(['A']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['A', 'B']);
  });

  it('follows a chain of two bases', () => {
    const r = planTranslate(
      [
        { className: 'A', source: cls('A', 'B') },
        { className: 'B', source: cls('B', 'C') },
        { className: 'C', source: cls('C') },
      ],
      sceneWith(['A']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['A', 'B', 'C']);
  });

  it('skips an unlinked class that is nobody\'s base', () => {
    const r = planTranslate(
      [
        { className: 'A', source: cls('A') },
        { className: 'Z', source: cls('Z') },
      ],
      sceneWith(['A']),
      tsSyntaxCheck,
    );
    expect(r.classes.map((c) => c.className)).toEqual(['A']);
  });

  it('emits EventWatcher for the clickgoto fixtures', () => {
    const dir = join(__dirname, '..', 'fixtures', 'clickgoto', 'scripts');
    const names = ['EventWatcher', 'LeftButton', 'MainTimeline', 'RightButton'];
    const sources = names.map((n) => ({ className: n, source: readFileSync(join(dir, `${n}.as`), 'utf8') }));
    const r = planTranslate(sources, sceneWith(['MainTimeline', 'LeftButton', 'RightButton']), tsSyntaxCheck);
    expect(r.classes.map((c) => c.className)).toEqual(names);
    expect(r.classes[0].fileName).toBe('EventWatcher.ts');
  });
});

describe('translateStage errors', () => {
  const artifact = { scene: sceneWith([]) } as unknown as ConvertedArtifact;
  const unpackedAt = (scriptsDir: string) => ({ scriptsDir }) as unknown as UnpackResult;

  it('throws ScriptsDirError for a missing directory', async () => {
    const err = await translateStage(unpackedAt(join(tmpdir(), 'no-such-dir-translate-test')), artifact).catch((e) => e);
    expect(err).toBeInstanceOf(ScriptsDirError);
    expect(err).toBeInstanceOf(PipelineError);
    expect(err.stage).toBe('translate');
  });

  it('does not throw for the same simple name in the unnamed package and in a package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'translate-dup-'));
    try {
      await mkdir(join(root, 'p'), { recursive: true });
      await writeFile(join(root, 'A.as'), cls('A'));
      await writeFile(join(root, 'p', 'A.as'), 'package p {\n  public class A {\n  }\n}\n');
      const r = await translateStage(unpackedAt(root), { scene: sceneWith(['A', 'p.A']) } as unknown as ConvertedArtifact);
      expect(r.classes.map((c) => c.className)).toEqual(['A', 'p.A']);
      expect(r.skippedScripts).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips a script whose path gives no Qualified_Name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'translate-skip-'));
    try {
      await writeFile(join(root, 'A.as'), cls('A'));
      await writeFile(join(root, 'B.C.as'), cls('B'));
      const r = await translateStage(unpackedAt(root), { scene: sceneWith(['A']) } as unknown as ConvertedArtifact);
      expect(r.classes.map((c) => c.className)).toEqual(['A']);
      expect(r.skippedScripts).toEqual(['B.C.as']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});