import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLValidator } from 'fast-xml-parser';
import { MissingExportError } from '../unpack/errors';
import type { UnpackResult } from '../unpack/unpack';
import { extractClassProperties } from './classProps';
import { MalformedSvgError } from './errors';
import { parseStructure, readDumpHeader } from './ffdecXml';
import type { ClassSourceModel, ShapeAssetModel, TagsModel } from './model';
import { extractSvgOrigin } from './svgOrigin';
import { parseSymbolsCsv } from './symbolsCsv';

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function listSvgFiles(shapesDir: string): Promise<string[] | null> {
  try {
    const names = await readdir(shapesDir);
    return names.filter((n) => n.toLowerCase().endsWith('.svg')).sort(byCodeUnit);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** Reads the FFDec output directory into a plain-data TagsModel. */
export async function readUnpacked(unpacked: UnpackResult): Promise<TagsModel> {
  const dumpText = await readFile(unpacked.structureDumpPath, 'utf8');
  const { xmlVersion, header } = readDumpHeader(dumpText);
  const structure = parseStructure(dumpText);

  const symbolClasses = parseSymbolsCsv(await readFile(unpacked.symbolClassPath, 'utf8'));

  const files = await listSvgFiles(unpacked.shapesDir);
  if (files === null && structure.declaredShapeIds.length > 0) {
    throw new MissingExportError(['shapes']);
  }
  const shapeAssets: ShapeAssetModel[] = [];
  for (const file of files ?? []) {
    const id = Number(file.slice(0, -'.svg'.length));
    if (!Number.isSafeInteger(id) || id < 0) continue;
    const svg = await readFile(join(unpacked.shapesDir, file), 'utf8');
    if (svg === '') {
      shapeAssets.push({ id, svg: '', origin: null });
      continue;
    }
    if (XMLValidator.validate(svg) !== true) throw new MalformedSvgError(file);
    shapeAssets.push({ id, svg, origin: extractSvgOrigin(svg) });
  }
  shapeAssets.sort((a, b) => a.id - b.id);

  const classSources: ClassSourceModel[] = [];
  const seen = new Set<string>();
  for (const { className } of symbolClasses) {
    if (seen.has(className)) continue;
    seen.add(className);
    const src = await readOptional(join(unpacked.scriptsDir, `${className}.as`));
    classSources.push({ className, properties: src === null ? null : extractClassProperties(src) });
  }

  return {
    xmlVersion: { major: xmlVersion.major, minor: xmlVersion.minor },
    header,
    background: structure.background,
    root: structure.root,
    sprites: structure.sprites,
    declaredShapeIds: structure.declaredShapeIds,
    morphShapeIds: structure.morphShapeIds,
    shapeAssets,
    symbolClasses,
    classSources,
    unsupported: structure.unsupported,
  };
}
