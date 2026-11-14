import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { XMLValidator } from 'fast-xml-parser';
import { MissingExportError } from '../unpack/errors';
import type { UnpackResult } from '../unpack/unpack';
import { extractClassProperties } from './classProps';
import { MalformedSvgError } from './errors';
import { parseStructure, readDumpHeader } from './ffdecXml';
import type { ClassSourceModel, ShapeAssetModel, TagsModel, UnsupportedObservation } from './model';
import { extractSvgOrigin } from './svgOrigin';
import { InvalidClassNameError, scriptRelPath } from './qualifiedName';
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

/** scripts/<pkg segments>/<Cls>.as for a dotted name; throws when the result leaves the scripts directory. */
function scriptFilePath(scriptsDir: string, className: string): string {
  const root = resolve(scriptsDir);
  const file = resolve(root, ...scriptRelPath(className).split('/'));
  const rel = relative(root, file);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new InvalidClassNameError(className, 'resolves outside the scripts directory', 'convert');
  }
  return file;
}

/** Reads the FFDec output directory into a plain-data TagsModel. */
export async function readUnpacked(unpacked: UnpackResult): Promise<TagsModel> {
  const dumpText = await readFile(unpacked.structureDumpPath, 'utf8');
  const { xmlVersion, header } = readDumpHeader(dumpText);
  const structure = parseStructure(dumpText);

  const symbolClasses = parseSymbolsCsv(
    unpacked.symbolClassPath === null ? '' : await readFile(unpacked.symbolClassPath, 'utf8'),
  );

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

  // Static text: texts/<id>.svg per staticTextIds entry. A missing, empty or invalid file is a Named_Limit (10.4).
  // The empty-group SVGs FFDec writes for DefineEditTextTag are never looked up (F7).
  const textAssets: ShapeAssetModel[] = [];
  const unsupported: UnsupportedObservation[] = [...structure.unsupported];
  for (const id of [...new Set(structure.staticTextIds)].sort((a, b) => a - b)) {
    const svg = await readOptional(join(unpacked.textsDir, `${id}.svg`));
    if (svg === null || svg === '' || XMLValidator.validate(svg) !== true) {
      unsupported.push({
        kind: 'text',
        tagName: 'DefineTextTag',
        characterId: id,
        message: `static text is not drawn; texts/${id}.svg is missing, empty or invalid (character ${id})`,
      });
      continue;
    }
    textAssets.push({ id, svg, origin: extractSvgOrigin(svg) });
  }

  const classSources: ClassSourceModel[] = [];
  const seen = new Set<string>();
  for (const { className } of symbolClasses) {
    if (seen.has(className)) continue;
    seen.add(className);
    const src = await readOptional(scriptFilePath(unpacked.scriptsDir, className));
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
    staticTextIds: structure.staticTextIds,
    bitmapIds: structure.bitmapIds,
    shapeAssets,
    textAssets,
    symbolClasses,
    classSources,
    unsupported,
  };
}
