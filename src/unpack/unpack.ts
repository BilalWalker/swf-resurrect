import { access, open, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { checkXmlVersion, isAs3Dump, readDumpHeader } from '../convert/ffdecXml';
import type { SwfHeader, XmlVersion } from '../convert/ffdecXml';
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
  symbolClassPath: string;
  scriptsDir: string;
  header: SwfHeader;
  xmlVersion: XmlVersion;
}

const AS3_CHECK_BYTES = 64 * 1024;

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
  const expected: Array<[string, string]> = [
    ['shapes', shapesDir],
    ['structure.xml', structureDumpPath],
    ['symbolClass/symbols.csv', symbolClassPath],
    ['scripts', scriptsDir],
  ];
  const missing: string[] = [];
  for (const [name, path] of expected) {
    if (!(await exists(path))) missing.push(name);
  }
  if (missing.length > 0) throw new MissingExportError(missing);

  return { workDir, shapesDir, structureDumpPath, symbolClassPath, scriptsDir, header, xmlVersion };
}
