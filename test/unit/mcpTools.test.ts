import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTools } from '../../mcp/swf-inspector/tools';
import type { SpawnRequest } from '../../src/unpack/spawnFfdec';

describe('inspector tools with a fake FFDec', () => {
  let root: string;
  const calls: string[][] = [];
  const swfBytes = Buffer.from([0x46, 0x57, 0x53, 0x0a, 0, 0, 0, 0]); // "FWS" + version

  const spawner = async (req: SpawnRequest) => {
    calls.push([...req.args]);
    if (req.args[0] === '-swf2xml') {
      await writeFile(
        req.args[2],
        '<swf version="10" frameCount="1" frameRate="12.0" compression="NONE"><displayRect Xmax="2000" Xmin="0" Ymax="1000" Ymin="0"/>' +
          '<tags><item type="PlaceObject2Tag" depth="1" name="a"/><item type="PlaceObject2Tag" depth="2"/><item type="ShowFrameTag"/></tags></swf>',
      );
    } else if (req.args[1] === 'script') {
      await mkdir(path.join(req.args[2], 'scripts', 'pkg'), { recursive: true });
      await writeFile(path.join(req.args[2], 'scripts', 'Main.as'), 'package {\n  public class Main {}\n}\n');
      await writeFile(path.join(req.args[2], 'scripts', 'pkg', 'Util.as'), 'package pkg {}\n');
    } else if (req.args[0] === '-format') {
      if (req.args[3] === '1') await writeFile(path.join(req.args[6], '1.png'), Buffer.from([1, 2, 3]));
    }
    return { stdout: '', stderr: '' };
  };

  const tool = (name: string) => {
    const t = createTools({
      repoRoot: root,
      jarPath: path.join(root, 'ffdec.jar'),
      cacheDir: path.join(root, '.work', 'cache'),
      spawner,
    }).find((x) => x.name === name);
    if (t === undefined) throw new Error(name);
    return t;
  };
  const text = async (name: string, args: Record<string, unknown>) => {
    const r = await tool(name).run(args);
    return { text: r.content.map((c) => (c.type === 'text' ? c.text : `[image ${c.mimeType} ${c.data}]`)).join('\n'), isError: r.isError === true };
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'swf-inspector-'));
    await mkdir(path.join(root, 'samples', 'a'), { recursive: true });
    await writeFile(path.join(root, 'samples', 'a', 'test.swf'), swfBytes);
    await writeFile(path.join(root, 'ffdec.jar'), '');
    calls.length = 0;
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('swf_summary runs FFDec once and then answers from the cache', async () => {
    const first = await text('swf_summary', { swf: 'samples/a/test.swf' });
    expect(first.text).toContain('SWF: samples/a/test.swf');
    expect(first.text).toContain('stage 100 x 50 px');
    expect(first.text).toContain('ActionScript 3: NO');
    expect(first.text).toMatch(/2 {2}PlaceObject2Tag/);
    await text('swf_summary', { swf: 'samples/a/test.swf' });
    await text('swf_find_tags', { swf: 'samples/a/test.swf', tagType: 'ShowFrameTag' });
    expect(calls.filter((c) => c[0] === '-swf2xml')).toHaveLength(1);
  });

  it('swf_find_tags returns opening elements, respects the limit and validates the tag name', async () => {
    const all = await text('swf_find_tags', { swf: 'samples/a/test.swf', tagType: 'PlaceObject2Tag' });
    expect(all.text).toContain('2 PlaceObject2Tag items');
    expect(all.text).toContain('<item type="PlaceObject2Tag" depth="1" name="a"/>');
    const one = await text('swf_find_tags', { swf: 'samples/a/test.swf', tagType: 'PlaceObject2Tag', limit: 1 });
    expect(one.text).toContain('1 more');
    const none = await text('swf_find_tags', { swf: 'samples/a/test.swf', tagType: 'DefineEditTextTag' });
    expect(none.text).toContain('no DefineEditTextTag items');
    expect((await text('swf_find_tags', { swf: 'samples/a/test.swf', tagType: 'x"][' })).isError).toBe(true);
  });

  it('lists classes and returns numbered source', async () => {
    const list = await text('swf_list_classes', { swf: 'samples/a/test.swf' });
    expect(list.text).toContain('2 classes');
    expect(list.text).toContain('Main');
    expect(list.text).toContain('pkg.Util');
    const src = await text('swf_class_source', { swf: 'samples/a/test.swf', className: 'Main' });
    expect(src.text).toContain('2    public class Main {}');
    const from2 = await text('swf_class_source', { swf: 'samples/a/test.swf', className: 'Main', fromLine: 2 });
    expect(from2.text).not.toContain('package {');
    expect(calls.filter((c) => c[1] === 'script')).toHaveLength(1);
  });

  it('swf_class_source refuses unknown classes and path tricks', async () => {
    expect((await text('swf_class_source', { swf: 'samples/a/test.swf', className: 'Nope' })).isError).toBe(true);
    expect((await text('swf_class_source', { swf: 'samples/a/test.swf', className: '../../x' })).isError).toBe(true);
  });

  it('swf_reference_frame returns a PNG image, or an error when FFDec writes none', async () => {
    const r = await tool('swf_reference_frame').run({ swf: 'samples/a/test.swf', frame: 1 });
    expect(r.content[1]).toEqual({ type: 'image', data: Buffer.from([1, 2, 3]).toString('base64'), mimeType: 'image/png' });
    expect((await text('swf_reference_frame', { swf: 'samples/a/test.swf', frame: 9 })).isError).toBe(true);
    expect((await text('swf_reference_frame', { swf: 'samples/a/test.swf', frame: 0 })).isError).toBe(true);
  });

  it('rejects paths outside the repo, missing files and files that are not SWFs', async () => {
    await writeFile(path.join(root, 'samples', 'a', 'notes.txt'), 'hello');
    await expect(tool('swf_summary').run({ swf: '../outside.swf' })).rejects.toThrow(/outside the repository/);
    await expect(tool('swf_summary').run({ swf: 'samples/a/missing.swf' })).rejects.toThrow(/cannot read/);
    await expect(tool('swf_summary').run({ swf: 'samples/a/notes.txt' })).rejects.toThrow(/not a SWF/);
    await expect(tool('fidelity_summary').run({ dir: '..' })).rejects.toThrow(/outside the repository/);
    expect(calls).toHaveLength(0);
  });

  it('names the missing FFDec jar', async () => {
    await rm(path.join(root, 'ffdec.jar'));
    await expect(tool('swf_summary').run({ swf: 'samples/a/test.swf' })).rejects.toThrow(/FFDec jar not found/);
  });

  it('fidelity_summary reads the reports of an output directory', async () => {
    const out = path.join(root, 'out', 'a');
    await mkdir(out, { recursive: true });
    await writeFile(
      path.join(out, 'fidelity-report.json'),
      JSON.stringify({ sample: 'a', visual: { status: 'compared', overallMatch: 100, frames: [] }, behaviour: { status: 'compared', traceScore: 75 }, problems: [] }),
    );
    const r = await text('fidelity_summary', { dir: 'out/a' });
    expect(r.text).toContain('Output directory: out/a');
    expect(r.text).toContain('Overall_Match: 100.00%');
    expect(r.text).toContain('Trace_Score: 75.00%');
    expect(r.text).toContain('translation-report.json: not found');
    expect((await text('fidelity_summary', { dir: 'out/missing' })).isError).toBe(true);
  });
});
