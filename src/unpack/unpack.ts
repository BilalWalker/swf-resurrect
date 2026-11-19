import { access, open, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { checkXmlVersion, isAs3Dump, readDumpHeader } from '../convert/ffdecXml';
import type { SwfHeader, XmlVersion } from '../convert/ffdecXml';
import { FfdecNotFoundError, FfdecTimeoutError, MissingExportError, NotAs3Error } from './errors';
import { spawnFfdec } from './spawnFfdec';
import type { FfdecSpawner } from './spawnFfdec';
import { assertValidSwfFile } from './swfSniff';

export type { SwfHeader };

export interface UnpackInput {
  swfPath: string;
  workDir: string;
  ffdecJarPath: string;
  javaCommand?: string;
  timeoutMs?: number;
  /**
   * Stage allowance in ms. When given, each FFDec call is bounded by what is left of it, not by timeoutMs.
   * Without it the fixed 	imeoutMs (default 60 s) applies, as before.
   */
  allowanceMs?: number;
  /** Names the allowance in a timeout error, for example 120 s stage limit. */
  allowanceLabel?: string;
  /** Test seam: milliseconds clock for the remaining allowance. */
  now?: () => number;
  /** Test seam: replaces the real process spawner. */
  spawner?: FfdecSpawner;
}

export interface UnpackResult {
  workDir: string;
  shapesDir: string;
  /** Static text SVGs (texts/<id>.svg); FFDec writes the directory only when the SWF has text. */
  textsDir: string;
  structureDumpPath: string;
  scriptsDir: string;
  header: SwfHeader;
  xmlVersion: XmlVersion;
}

const AS3_CHECK_BYTES = 64 * 1024;

/** True when the swf2xml dump holds an item of type SymbolClassTag. Pure. */
export function hasSymbolClassTag(xmlText: string): boolean {
  return /<item\b[^>]*\btype\s*=\s*"SymbolClassTag"/.test(xmlText);
}

/** True when the swf2xml dump holds a DefineTextTag, DefineText2Tag or DefineEditTextTag item. Pure. */
export function hasTextTag(xmlText: string): boolean {
  return /<item\b[^>]*\btype\s*=\s*"Define(Text|Text2|EditText)Tag"/.test(xmlText);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readHead(path: string, bytes: number): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/** Unpacks a SWF with exactly two FFDec invocations, run at once: -swf2xml, and -format text:svg -export shape,script,text. */
export async function unpack(input: UnpackInput): Promise<UnpackResult> {
  const swfPath = resolve(input.swfPath);
  const workDir = resolve(input.workDir);
  const jarPath = resolve(input.ffdecJarPath);
  const javaCommand = input.javaCommand ?? 'java';
  const timeoutMs = input.timeoutMs ?? 60_000;
  const spawn = input.spawner ?? spawnFfdec;
  const now = input.now ?? Date.now;
  const startedAt = now();
  const run: FfdecSpawner = async (req) => {
    const bound = input.allowanceMs === undefined ? timeoutMs : Math.max(1, input.allowanceMs - (now() - startedAt));
    try {
      return await spawn({ ...req, timeoutMs: bound });
    } catch (err) {
      if (err instanceof FfdecTimeoutError && input.allowanceMs !== undefined && input.allowanceLabel !== undefined) err.limit = input.allowanceLabel;
      throw err;
    }
  };

  await assertValidSwfFile(swfPath);
  if (!(await exists(jarPath))) throw new FfdecNotFoundError(jarPath);

  const structureDumpPath = join(workDir, 'structure.xml');

  // The dump and the export read the same SWF and write different files, so the two FFDec processes run at once
  // (design D-E3). Both calls get what is left of the stage allowance at their start, which is the whole of it, so
  // the stage as a whole stays inside the allowance. The first error that matters is the one the sequential order gave:
  // a dump error, then not-AS3 or a bad XML version, then an export error. A failed dump or a refused file kills the export.
  const exportAbort = new AbortController();
  const dumpP = run({ javaCommand, jarPath, args: ['-swf2xml', swfPath, structureDumpPath], timeoutMs });
  const exportP = run({
    javaCommand,
    jarPath,
    args: ['-format', 'text:svg', '-export', 'shape,script,text', workDir, swfPath],
    timeoutMs,
    signal: exportAbort.signal,
  }).then(
    () => null,
    (error: unknown) => ({ error }),
  );

  let xmlText: string;
  let xmlVersion: XmlVersion;
  let header: SwfHeader;
  try {
    await dumpP;
    const head = await readHead(structureDumpPath, AS3_CHECK_BYTES);
    if (!isAs3Dump(head)) throw new NotAs3Error();
    xmlText = await readFile(structureDumpPath, 'utf8');
    ({ xmlVersion, header } = readDumpHeader(xmlText));
    checkXmlVersion(xmlVersion);
  } catch (err) {
    exportAbort.abort(err);
    await exportP;
    throw err;
  }
  if (xmlVersion.minor !== 2) {
    console.warn(`Warning: FFDec XML export minor version is ${xmlVersion.minor}; the verified version is 4.2`);
  }
  const exported = await exportP;
  if (exported !== null) throw exported.error;

  const shapesDir = join(workDir, 'shapes');
  const textsDir = join(workDir, 'texts');
  const scriptsDir = join(workDir, 'scripts');
  const expected: Array<[string, string, boolean]> = [
    ['shapes', shapesDir, true],
    ['structure.xml', structureDumpPath, true],
    ['scripts', scriptsDir, true],
    // texts/ is expected only when the dump holds a text definition tag.
    ['texts', textsDir, hasTextTag(xmlText)],
  ];
  const missing: string[] = [];
  for (const [name, path, required] of expected) {
    if (required && !(await exists(path))) missing.push(name);
  }
  if (missing.length > 0) throw new MissingExportError(missing);

  return {
    workDir,
    shapesDir,
    textsDir,
    structureDumpPath,
    scriptsDir,
    header,
    xmlVersion,
  };
}
