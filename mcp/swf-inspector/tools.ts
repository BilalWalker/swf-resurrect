// Edge: the inspector's tools. Each one answers a question an agent otherwise needs several FFDec
// shell commands for. FFDec runs once per SWF and export kind; results are cached under .work/.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnFfdec, type FfdecSpawner } from '../../src/unpack/spawnFfdec';
import { isSwfSignature } from '../../src/unpack/swfSniff';
import { displayPath, resolveInsideRepo } from './paths';
import { errorResult, textResult, type ToolDefinition, type ToolResult } from './protocol';
import { classNameOfScript, renderDumpSummary, renderReportSummary, scriptPathOfClass, summariseDump } from './summaries';

export interface InspectorDeps {
  repoRoot: string;
  /** Absolute path of ffdec-cli.jar. */
  jarPath: string;
  /** Directory for cached FFDec exports. */
  cacheDir: string;
  spawner?: FfdecSpawner;
  javaCommand?: string;
}

const FFDEC_TIMEOUT_MS = 120_000;
const MAX_SOURCE_LINES = 400;

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

async function walk(dir: string, suffix: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, suffix, base)));
    else if (entry.name.endsWith(suffix)) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

export function createTools(deps: InspectorDeps): ToolDefinition[] {
  const run = deps.spawner ?? spawnFfdec;
  const javaCommand = deps.javaCommand ?? 'java';

  /** Validated SWF path plus its cache directory (keyed by content hash, so edits never serve stale data). */
  async function openSwf(given: unknown): Promise<{ swfPath: string; shown: string; cache: string }> {
    const swfPath = resolveInsideRepo(deps.repoRoot, String(given));
    let bytes: Buffer;
    try {
      bytes = await readFile(swfPath);
    } catch {
      throw new Error(`cannot read ${String(given)}`);
    }
    if (!isSwfSignature(bytes)) throw new Error(`${String(given)} is not a SWF file (bad signature)`);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const cache = path.join(deps.cacheDir, sha);
    await mkdir(cache, { recursive: true });
    return { swfPath, shown: displayPath(deps.repoRoot, swfPath), cache };
  }

  async function ffdec(args: string[]): Promise<void> {
    if (!(await exists(deps.jarPath))) {
      throw new Error(`FFDec jar not found at ${deps.jarPath} (set SWF_RESURRECT_FFDEC or install tools/ffdec)`);
    }
    await run({ javaCommand, jarPath: deps.jarPath, args, timeoutMs: FFDEC_TIMEOUT_MS });
  }

  async function dumpOf(swf: { swfPath: string; cache: string }): Promise<string> {
    const xmlPath = path.join(swf.cache, 'structure.xml');
    if (!(await exists(xmlPath))) await ffdec(['-swf2xml', swf.swfPath, xmlPath]);
    return readFile(xmlPath, 'utf8');
  }

  async function scriptsOf(swf: { swfPath: string; cache: string }): Promise<string> {
    const dir = path.join(swf.cache, 'scripts');
    const marker = path.join(swf.cache, 'scripts.done');
    if (!(await exists(marker))) {
      await ffdec(['-export', 'script', swf.cache, swf.swfPath]);
      await mkdir(dir, { recursive: true }); // a SWF without classes exports nothing
      await mkdir(marker, { recursive: true });
    }
    return dir;
  }

  const swfArg = {
    type: 'string',
    description: 'Path of a .swf inside the repository, relative to the repo root (for example samples/clickgoto/test.swf).',
  };

  return [
    {
      name: 'swf_summary',
      description:
        'Header facts and tag counts of a SWF: version, frame count and rate, stage size, whether it is ActionScript 3, ' +
        'whether a SymbolClass tag exists, the number of classes, and how many of each SWF tag type it holds. ' +
        'Use it first to see what a SWF contains (shapes, sprites, text, buttons, morph shapes, sounds, bitmaps).',
      inputSchema: { type: 'object', properties: { swf: swfArg }, required: ['swf'], additionalProperties: false },
      async run(args): Promise<ToolResult> {
        const swf = await openSwf(args.swf);
        return textResult(renderDumpSummary(swf.shown, summariseDump(await dumpOf(swf))));
      },
    },
    {
      name: 'swf_find_tags',
      description:
        'Lists the items of one SWF tag type from the FFDec dump (for example DefineSpriteTag, PlaceObject3Tag, ' +
        'DefineEditTextTag), each as its opening XML element with all attributes. Use it to read character ids, ' +
        'depths, names, clip depths, ratios and flags without exporting the whole dump.',
      inputSchema: {
        type: 'object',
        properties: {
          swf: swfArg,
          tagType: { type: 'string', description: 'Exact tag type name ending in "Tag", for example PlaceObject2Tag.' },
          limit: { type: 'integer', description: 'Most items to return (default 40).' },
        },
        required: ['swf', 'tagType'],
        additionalProperties: false,
      },
      async run(args): Promise<ToolResult> {
        const tagType = String(args.tagType);
        if (!/^[A-Za-z0-9]+Tag$/.test(tagType)) return errorResult('tagType must be a tag type name such as PlaceObject2Tag');
        const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 200) : 40;
        const swf = await openSwf(args.swf);
        const xml = await dumpOf(swf);
        const found = [...xml.matchAll(new RegExp(`<item type="${tagType}"[^>]*>`, 'g'))].map((m) => m[0]);
        if (found.length === 0) return textResult(`${swf.shown}: no ${tagType} items`);
        const shown = found.slice(0, limit);
        const more = found.length > shown.length ? `\n... ${found.length - shown.length} more (raise limit)` : '';
        return textResult(`${swf.shown}: ${found.length} ${tagType} items\n${shown.join('\n')}${more}`);
      },
    },
    {
      name: 'swf_list_classes',
      description:
        'Lists the ActionScript 3 classes FFDec decompiles from a SWF, as Qualified_Names with line counts. ' +
        'Use it before swf_class_source.',
      inputSchema: { type: 'object', properties: { swf: swfArg }, required: ['swf'], additionalProperties: false },
      async run(args): Promise<ToolResult> {
        const swf = await openSwf(args.swf);
        const dir = await scriptsOf(swf);
        const files = await walk(dir, '.as');
        if (files.length === 0) return textResult(`${swf.shown}: FFDec exported no classes`);
        const rows: string[] = [];
        for (const f of files) {
          const lines = (await readFile(path.join(dir, f), 'utf8')).split('\n').length;
          rows.push(`  ${String(lines).padStart(5)} lines  ${classNameOfScript(f)}`);
        }
        return textResult(`${swf.shown}: ${files.length} classes\n${rows.join('\n')}`);
      },
    },
    {
      name: 'swf_class_source',
      description:
        'The decompiled ActionScript 3 source of one class of a SWF, with line numbers. This is the exact text the ' +
        'Translate stage reads. Long classes are cut; pass fromLine to read on.',
      inputSchema: {
        type: 'object',
        properties: {
          swf: swfArg,
          className: { type: 'string', description: 'Qualified_Name as listed by swf_list_classes, for example fl.controls.Slider.' },
          fromLine: { type: 'integer', description: 'First line to return, 1-based (default 1).' },
        },
        required: ['swf', 'className'],
        additionalProperties: false,
      },
      async run(args): Promise<ToolResult> {
        const rel = scriptPathOfClass(String(args.className));
        if (rel === null) return errorResult('className must be a dotted class name');
        const swf = await openSwf(args.swf);
        const file = path.join(await scriptsOf(swf), ...rel.split('/'));
        let text: string;
        try {
          text = await readFile(file, 'utf8');
        } catch {
          return errorResult(`${swf.shown} has no class ${String(args.className)} (see swf_list_classes)`);
        }
        const all = text.replace(/\r\n/g, '\n').split('\n');
        const from = typeof args.fromLine === 'number' && args.fromLine > 1 ? args.fromLine : 1;
        const slice = all.slice(from - 1, from - 1 + MAX_SOURCE_LINES);
        const width = String(from + slice.length).length;
        const body = slice.map((l, i) => `${String(from + i).padStart(width)}  ${l}`).join('\n');
        const end = from - 1 + slice.length;
        const more = end < all.length ? `\n... ${all.length - end} more lines (fromLine: ${end + 1})` : '';
        return textResult(`${String(args.className)} (${all.length} lines)\n${body}${more}`);
      },
    },
    {
      name: 'swf_reference_frame',
      description:
        'Renders one root-timeline frame of the original SWF with FFDec and returns it as a PNG image. This is the ' +
        'reference image the Verify stage compares the converted output against. Frame numbers are 1-based.',
      inputSchema: {
        type: 'object',
        properties: { swf: swfArg, frame: { type: 'integer', description: 'Frame number, 1-based.' } },
        required: ['swf', 'frame'],
        additionalProperties: false,
      },
      async run(args): Promise<ToolResult> {
        const frame = args.frame as number;
        if (frame < 1) return errorResult('frame must be 1 or greater');
        const swf = await openSwf(args.swf);
        const dir = path.join(swf.cache, 'frames');
        const png = path.join(dir, `${frame}.png`);
        if (!(await exists(png))) {
          await mkdir(dir, { recursive: true });
          await ffdec(['-format', 'frame:png', '-select', String(frame), '-export', 'frame', dir, swf.swfPath]);
        }
        let bytes: Buffer;
        try {
          bytes = await readFile(png);
        } catch {
          return errorResult(`FFDec wrote no image for frame ${frame} of ${swf.shown} (frame number past the end?)`);
        }
        return {
          content: [
            { type: 'text', text: `${swf.shown} frame ${frame}, rendered by FFDec` },
            { type: 'image', data: bytes.toString('base64'), mimeType: 'image/png' },
          ],
        };
      },
    },
    {
      name: 'fidelity_summary',
      description:
        'Reads fidelity-report.json, translation-report.json and unsupported-features.json from a pipeline output ' +
        'directory and returns the scores (Overall_Match, Trace_Score or why they were not compared), the lowest ' +
        'frames, known limits, problems, class counts by status and unsupported features. Read-only; it never runs the pipeline.',
      inputSchema: {
        type: 'object',
        properties: {
          dir: { type: 'string', description: 'Pipeline output directory inside the repository, for example out/clickgoto.' },
        },
        required: ['dir'],
        additionalProperties: false,
      },
      async run(args): Promise<ToolResult> {
        const dir = resolveInsideRepo(deps.repoRoot, String(args.dir));
        if (!(await exists(dir))) return errorResult(`no such directory: ${String(args.dir)}`);
        return textResult(
          renderReportSummary(displayPath(deps.repoRoot, dir) || '.', {
            fidelity: await readJson(path.join(dir, 'fidelity-report.json')),
            translation: await readJson(path.join(dir, 'translation-report.json')),
            unsupported: await readJson(path.join(dir, 'unsupported-features.json')),
          }),
        );
      },
    },
  ];
}
