import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSymbolsCsv } from '../../src/convert/symbolsCsv';
import { readUnpacked } from '../../src/convert/readUnpacked';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import type { UnpackResult } from '../../src/unpack/unpack';
import { readFileSync } from 'node:fs';

const TEXT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5"><g transform="matrix(1,0,0,1,1,2)"><path d="M0 0 L1 1"/></g></svg>';

describe('readUnpacked', () => {
  it('builds a TagsModel from the clickgoto fixture directory', async () => {
    const dir = resolve(__dirname, '../fixtures/clickgoto');
    const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(dir, 'structure.xml'), 'utf8'));
    const unpacked: UnpackResult = {
      workDir: dir,
      shapesDir: resolve(dir, 'shapes'),
      textsDir: resolve(dir, 'texts'),
      structureDumpPath: resolve(dir, 'structure.xml'),
      symbolClassPath: resolve(dir, 'symbols.csv'),
      scriptsDir: resolve(dir, 'scripts'),
      header,
      xmlVersion,
    };
    const model = await readUnpacked(unpacked);
    expect(model.shapeAssets.map((s) => s.id)).toEqual([1, 2, 4, 5]);
    expect(model.shapeAssets.every((s) => s.svg !== null && s.svg !== '' && s.origin !== null)).toBe(true);
    expect(model.classSources.map((c) => c.className).sort()).toEqual(['LeftButton', 'MainTimeline', 'RightButton']);
    expect(model.header.frameCount).toBe(3);
  });

  it('4.4 a null symbolClassPath gives empty symbolClasses and classSources', async () => {
    const dir = resolve(__dirname, '../fixtures/clickgoto');
    const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(dir, 'structure.xml'), 'utf8'));
    const model = await readUnpacked({
      workDir: dir,
      shapesDir: resolve(dir, 'shapes'),
      textsDir: resolve(dir, 'texts'),
      structureDumpPath: resolve(dir, 'structure.xml'),
      symbolClassPath: null,
      scriptsDir: resolve(dir, 'scripts'),
      header,
      xmlVersion,
    });
    expect(model.symbolClasses).toEqual([]);
    expect(model.classSources).toEqual([]);
  });

  it('18.1 parseSymbolsCsv keeps dotted names unchanged', () => {
    expect(parseSymbolsCsv('2;"fl.controls.Slider"\n')).toEqual([{ id: 2, className: 'fl.controls.Slider' }]);
  });

  describe('static text assets (12.1)', () => {
    /** clickgoto dump plus static text 20, 21, 22 and an edit text 23; texts/ holds the files given. */
    async function readWithTexts(files: Record<string, string>) {
      const src = resolve(__dirname, '../fixtures/clickgoto');
      const dir = mkdtempSync(join(tmpdir(), 'swf-texts-'));
      try {
        const xml = readFileSync(resolve(src, 'structure.xml'), 'utf8').replace(
          '<item type="DefineShape4Tag"',
          '<item type="DefineTextTag" characterID="20" forceWriteAsLong="false"/>' +
            '<item type="DefineTextTag" characterID="21" forceWriteAsLong="false"/>' +
            '<item type="DefineTextTag" characterID="22" forceWriteAsLong="false"/>' +
            '<item type="DefineEditTextTag" characterID="23" forceWriteAsLong="false"/>' +
            '<item type="DefineShape4Tag"',
        );
        writeFileSync(join(dir, 'structure.xml'), xml);
        mkdirSync(join(dir, 'texts'));
        for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'texts', name), body);
        const { xmlVersion, header } = readDumpHeader(xml);
        return await readUnpacked({
          workDir: dir,
          shapesDir: resolve(src, 'shapes'),
          textsDir: join(dir, 'texts'),
          structureDumpPath: join(dir, 'structure.xml'),
          symbolClassPath: null,
          scriptsDir: resolve(src, 'scripts'),
          header,
          xmlVersion,
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it('reads texts/<id>.svg into textAssets and ignores the edit text file (F7)', async () => {
      const model = await readWithTexts({
        '20.svg': TEXT_SVG,
        '21.svg': TEXT_SVG,
        '22.svg': TEXT_SVG,
        '23.svg': '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>',
      });
      expect(model.staticTextIds).toEqual([20, 21, 22]);
      expect(model.textAssets.map((a) => a.id)).toEqual([20, 21, 22]);
      expect(model.textAssets[0]!.origin).toEqual({ x: 1, y: 2 });
      expect(model.unsupported.some((o) => o.characterId === 20 || o.characterId === 21 || o.characterId === 22)).toBe(false);
    });

    it('a missing, empty or invalid text file records a text limit and no asset (10.4)', async () => {
      const model = await readWithTexts({ '21.svg': '', '22.svg': '<svg><g></svg>' });
      expect(model.textAssets).toEqual([]);
      const limits = model.unsupported.filter((o) => o.kind === 'text' && [20, 21, 22].includes(o.characterId ?? -1));
      expect(limits.map((o) => o.characterId)).toEqual([20, 21, 22]);
    });

    it('a model without static text has no text assets', async () => {
      const dir = resolve(__dirname, '../fixtures/clickgoto');
      const { xmlVersion, header } = readDumpHeader(readFileSync(resolve(dir, 'structure.xml'), 'utf8'));
      const model = await readUnpacked({
        workDir: dir,
        shapesDir: resolve(dir, 'shapes'),
        textsDir: resolve(dir, 'texts'),
        structureDumpPath: resolve(dir, 'structure.xml'),
        symbolClassPath: null,
        scriptsDir: resolve(dir, 'scripts'),
        header,
        xmlVersion,
      });
      expect(model.textAssets).toEqual([]);
    });
  });
});
