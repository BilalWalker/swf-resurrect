import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { convertModel } from '../../src/convert/convertModel';
import {
  MalformedFrameDataError,
  MalformedSvgError,
  ShapeExportError,
  SymbolCycleError,
  UnknownSymbolError,
} from '../../src/convert/errors';
import { readDumpHeader } from '../../src/convert/ffdecXml';
import type { TagsModel, TimelineOp } from '../../src/convert/model';
import { convertStage } from '../../src/convert/writeConverted';
import type { UnpackResult } from '../../src/unpack/unpack';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1,0,0,1,0,0)"><path d="M0 0"/></g></svg>';
const show: TimelineOp = { kind: 'showFrame' };
const place = (depth: number, characterId: number, extra: Partial<Extract<TimelineOp, { kind: 'place' }>> = {}): TimelineOp => ({
  kind: 'place',
  depth,
  characterId,
  move: false,
  ...extra,
});

function model(over: Partial<TagsModel> = {}): TagsModel {
  return {
    xmlVersion: { major: 4, minor: 2 },
    header: { widthPx: 100, heightPx: 100, frameRate: 24, frameCount: 1 },
    background: null,
    root: { declaredFrameCount: 1, ops: [place(1, 1), show] },
    sprites: [],
    declaredShapeIds: [1],
    morphShapeIds: [],
    staticTextIds: [],
    bitmapIds: [],
    shapeAssets: [{ id: 1, svg: SVG, origin: { x: 0, y: 0 } }],
    textAssets: [],
    symbolClasses: [],
    classSources: [],
    unsupported: [],
    ...over,
  };
}

function fail(m: TagsModel): unknown {
  try {
    convertModel(m);
  } catch (e) {
    return e;
  }
  throw new Error('expected convertModel to throw');
}

describe('convertModel error paths', () => {
  it('names the character id for a missing SVG (3.5)', () => {
    const e = fail(model({ shapeAssets: [{ id: 1, svg: null, origin: null }] }));
    expect(e).toBeInstanceOf(ShapeExportError);
    expect((e as Error).message).toContain('Shape 1 ');
    expect((e as Error).message).toContain('missing');
  });

  it('names the character id for a zero-byte SVG (3.5)', () => {
    const e = fail(model({ shapeAssets: [{ id: 1, svg: '', origin: null }] }));
    expect(e).toBeInstanceOf(ShapeExportError);
    expect((e as Error).message).toContain('Shape 1 ');
    expect((e as Error).message).toContain('empty');
  });

  it('names symbol, sprite, frame and depth for an unknown symbol (4.7)', () => {
    const e = fail(model({ sprites: [{ id: 2, declaredFrameCount: 2, ops: [show, place(7, 99), show] }], root: { declaredFrameCount: 1, ops: [place(1, 2), show] } }));
    expect(e).toBeInstanceOf(UnknownSymbolError);
    expect((e as Error).message).toBe('Unknown symbol 99 placed in sprite 2, frame 2, depth 7');
  });

  it('names sprite and frame for malformed frame data (4.9)', () => {
    const e = fail(
      model({
        sprites: [{ id: 2, declaredFrameCount: 2, ops: [show, { kind: 'place', depth: 3, move: true }, show] }],
        root: { declaredFrameCount: 1, ops: [place(1, 2), show] },
      }),
    );
    expect(e).toBeInstanceOf(MalformedFrameDataError);
    expect((e as Error).message).toContain('sprite 2, frame 2');
  });

  it('rejects a non-integer twip translation, naming the root timeline (4.9)', () => {
    const bad = place(1, 1, { matrix: { a: 1, b: 0, c: 0, d: 1, txTwips: 1.5, tyTwips: 0 } });
    const e = fail(model({ root: { declaredFrameCount: 1, ops: [bad, show] } }));
    expect(e).toBeInstanceOf(MalformedFrameDataError);
    expect((e as Error).message).toContain('sprite root');
  });

  it('reports a sprite that places itself as a cycle', () => {
    const e = fail(
      model({
        sprites: [
          { id: 2, declaredFrameCount: 1, ops: [place(1, 3), show] },
          { id: 3, declaredFrameCount: 1, ops: [place(1, 2), show] },
        ],
        root: { declaredFrameCount: 1, ops: [place(1, 2), show] },
      }),
    );
    expect(e).toBeInstanceOf(SymbolCycleError);
    expect((e as Error).message).toBe('Sprite places itself: 2 -> 3 -> 2');
  });

  it('rejects duplicate symbol-class ids', () => {
    const e = fail(
      model({
        symbolClasses: [
          { id: 0, className: 'A' },
          { id: 0, className: 'B' },
        ],
      }),
    );
    expect(e).toBeInstanceOf(MalformedFrameDataError);
    expect((e as Error).message).toContain('duplicate id 0');
  });
});

describe('convertModel unsupported reporting', () => {
  it('reports each unsupported kind and each dropped placement (3.3, 3.7, 3.8)', () => {
    const m = model({
      declaredShapeIds: [1],
      morphShapeIds: [20],
      root: {
        declaredFrameCount: 1,
        ops: [
          place(1, 1),
          place(2, 10),
          place(3, 11),
          place(4, 12),
          place(5, 13),
          place(6, 1, { clipDepth: 9 }),
          place(7, 1, { hasFilters: true }),
          place(8, 20),
          show,
        ],
      },
      unsupported: [
        { kind: 'text', tagName: 'DefineTextTag', characterId: 10 },
        { kind: 'sound', tagName: 'DefineSoundTag', characterId: 11 },
        { kind: 'button', tagName: 'DefineButton2Tag', characterId: 12 },
        { kind: 'video', tagName: 'DefineVideoStreamTag', characterId: 13 },
      ],
    });
    const r = convertModel(m);
    const kinds = new Set(r.unsupported.map((u) => u.kind));
    for (const k of ['text', 'sound', 'button', 'video', 'mask', 'filter', 'morph-shape'] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
    const dropped = r.unsupported.filter((u) => u.context).map((u) => [u.kind, u.context?.spriteId, u.context?.frame, u.context?.depth]);
    expect(dropped).toEqual(
      expect.arrayContaining([
        ['text', 0, 1, 2],
        ['sound', 0, 1, 3],
        ['button', 0, 1, 4],
        ['video', 0, 1, 5],
        ['mask', 0, 1, 6],
        ['filter', 0, 1, 7],
        ['morph-shape', 0, 1, 8],
      ]),
    );
    expect(r.stats.morphSkipped).toBe(1);
    // Only the supported shape remains on the stage.
    expect(r.scene.symbols['0']).toMatchObject({ frames: [[{ depth: 1, symbolId: 1 }]] });
    expect(r.shapeFiles.map((f) => f.fileName)).toEqual(['1.shape.json']);
  });

  it('reports an unbound instance name (8.7)', () => {
    const m = model({
      root: { declaredFrameCount: 1, ops: [place(1, 1, { name: 'btn' }), place(2, 1, { name: 'ok' }), show] },
      symbolClasses: [{ id: 0, className: 'Main' }],
      classSources: [{ className: 'Main', properties: ['ok'] }],
    });
    const e = convertModel(m).unsupported.filter((u) => u.kind === 'unbound-instance');
    expect(e).toEqual([{ kind: 'unbound-instance', id: 0, message: 'instance btn has no property in class Main' }]);
  });
});

describe('convertStage error paths with staging directories', () => {
  const fixture = resolve(__dirname, '../fixtures/clickgoto');
  const temps: string[] = [];
  afterEach(() => {
    for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function setup(): UnpackResult {
    const dir = mkdtempSync(join(tmpdir(), 'swfr-conv-err-'));
    temps.push(dir);
    cpSync(fixture, dir, { recursive: true });
    const { xmlVersion, header } = readDumpHeader(readFileSync(join(dir, 'structure.xml'), 'utf8'));
    return {
      workDir: dir,
      shapesDir: join(dir, 'shapes'),
      textsDir: join(dir, 'texts'),
      structureDumpPath: join(dir, 'structure.xml'),
      symbolClassPath: join(dir, 'symbols.csv'),
      scriptsDir: join(dir, 'scripts'),
      header,
      xmlVersion,
    };
  }

  it('names the malformed SVG file and writes nothing (3.4)', async () => {
    const u = setup();
    writeFileSync(join(u.shapesDir, '2.svg'), '<svg><g></svg>');
    const err = await convertStage(u).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MalformedSvgError);
    expect((err as Error).message).toContain('2.svg');
    expect(existsSync(join(u.workDir, 'converted'))).toBe(false);
  });

  it('names the character id for a zero-byte SVG and writes nothing (3.5)', async () => {
    const u = setup();
    writeFileSync(join(u.shapesDir, '4.svg'), '');
    const err = await convertStage(u).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShapeExportError);
    expect((err as Error).message).toContain('Shape 4 ');
    expect(existsSync(join(u.workDir, 'converted'))).toBe(false);
  });

  it('names the character id for a missing SVG and writes nothing (3.5)', async () => {
    const u = setup();
    rmSync(join(u.shapesDir, '5.svg'));
    const err = await convertStage(u).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShapeExportError);
    expect((err as Error).message).toContain('Shape 5 ');
    expect(existsSync(join(u.workDir, 'converted'))).toBe(false);
  });
});
