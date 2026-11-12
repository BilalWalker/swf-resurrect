import { access, open, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { checkXmlVersion, isAs3Dump, readDumpHeader } from '../convert/ffdecXml';
import type { SwfHeader, XmlVersion } from '../convert/ffdecXml';
import { parseSymbolsCsv } from '../convert/symbolsCsv';
import { FfdecNotFoundError, MissingExportError, NotAs3Error } from './errors';
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
  /** Test seam: replaces the real process spawner. */
  spawner?: FfdecSpawner;
}

export interface UnpackResult {
  workDir: string;
  shapesDir: string;
  structureDumpPath: string;
  /** null: no SymbolClassTag in the dump and no symbols.csv. */
  symbolClassPath: string | null;
  scriptsDir: string;
  header: SwfHeader;
  xmlVersion: XmlVersion;
}

const AS3_CHECK_BYTES = 64 * 1024;

/** True when the swf2xml dump holds an item of type SymbolClassTag. Pure. */
export function hasSymbolClassTag(xmlText: string): boolean {
  return /<item\b[^>]*\btype\s*=\s*"SymbolClassTag"/.test(xmlText);
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

/** Unpacks a SWF with exactly two FFDec invocations: -swf2xml, then -export shape,script,symbolClass. */
export async function unpack(input: UnpackInput): Promise<UnpackResult> {
  const swfPath = resolve(input.swfPath);
  const workDir = resolve(input.workDir);
  const jarPath = resolve(input.ffdecJarPath);
  const javaCommand = input.javaCommand ?? 'java';
  const timeoutMs = input.timeoutMs ?? 60_000;
  const run = input.spawner ?? spawnFfdec;

  await assertValidSwfFile(swfPath);
  if (!(await exists(jarPath))) throw new FfdecNotFoundError(jarPath);

  const structureDumpPath = join(workDir, 'structure.xml');
  await run({ javaCommand, jarPath, args: ['-swf2xml', swfPath, structureDumpPath], timeoutMs });

  const head = await readHead(structureDumpPath, AS3_CHECK_BYTES);
  if (!isAs3Dump(head)) throw new NotAs3Error();

  const xmlText = await readFile(structureDumpPath, 'utf8');
  const { xmlVersion, header } = readDumpHeader(xmlText);
  checkXmlVersion(xmlVersion);
  if (xmlVersion.minor !== 2) {
    console.warn(`Warning: FFDec XML export minor version is ${xmlVersion.minor}; the verified version is 4.2`);
  }

  await run({ javaCommand, jarPath, args: ['-export', 'shape,script,symbolClass', workDir, swfPath], timeoutMs });

  const shapesDir = join(workDir, 'shapes');
  const symbolClassPath = join(workDir, 'symbolClass', 'symbols.csv');
  const scriptsDir = join(workDir, 'scripts');
  const symbolClassTag = hasSymbolClassTag(xmlText);
  const symbolClassPresent = await exists(symbolClassPath);
  const expected: Array<[string, string, boolean]> = [
    ['shapes', shapesDir, true],
    ['structure.xml', structureDumpPath, true],
    // symbols.csv is expected only when the dump holds a SymbolClassTag.
    ['symbolClass/symbols.csv', symbolClassPath, symbolClassTag],
    ['scripts', scriptsDir, true],
  ];
  const missing: string[] = [];
  for (const [name, path, required] of expected) {
    if (required && !(await exists(path))) missing.push(name);
  }
  if (missing.length > 0) throw new MissingExportError(missing);

  if (symbolClassPresent) parseSymbolsCsv(await readFile(symbolClassPath, 'utf8'), 'unpack');

  return {
    workDir,
    shapesDir,
    structureDumpPath,
    symbolClassPath: symbolClassPresent ? symbolClassPath : null,
    scriptsDir,
    header,
    xmlVersion,
  };
}
