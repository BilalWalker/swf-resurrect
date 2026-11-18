import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUTTON_FFDEC_JAR, buttonSwfSkipReason } from './buttonSwf';

/**
 * SymbolClass fixture (robustness task 25.1, Requirement 26). A generated SWF with one shape and two
 * sprites whose SymbolClassTag and ExportAssetsTag lists repeat ids and pairs. FFDec `-xml2swf` builds
 * the SWF; `-export symbolClass` and `-swf2xml` then measure what FFDec writes. Nothing copyrighted.
 */

export const symbolClassSwfSkipReason = buttonSwfSkipReason;

/** Ids used by the skeleton. Sprite ids carry the classes below. */
export const SYMBOL_CLASS_IDS = { shape: 1, spriteA: 2, spriteB: 3 } as const;

/** One list of pairs: [id, name]. */
export type Pair = readonly [number, string];

/**
 * The SymbolClassTag items, in tag order. Id 2: `A`, `B`, `A` in the first item (two names, one identical
 * repeat). Id 3: `C` in the first item and `D` in the second (two names across two items). Id 0: the
 * document class `Doc` and a second name `Extra`.
 */
export const SYMBOL_CLASS_ITEMS: readonly (readonly Pair[])[] = [
  [[2, 'A'], [2, 'B'], [2, 'A'], [3, 'C'], [0, 'Doc'], [0, 'Extra']],
  [[3, 'D']],
];

/** The ExportAssetsTag pairs: a name for id 2 that is not a SymbolClass pair, and an identical copy of (3, `C`). */
export const EXPORT_ASSET_PAIRS: readonly Pair[] = [
  [2, 'ExportName'],
  [3, 'C'],
];

function pairsXml(tag: string, pairs: readonly Pair[]): string {
  return `<item type="${tag}" forceWriteAsLong="true">
      <tags>${pairs.map(([id]) => `<item>${id}</item>`).join('')}</tags>
      <names>${pairs.map(([, n]) => `<item>${n}</item>`).join('')}</names>
    </item>`;
}

function shape(id: number): string {
  return `<item type="DefineShape4Tag" forceWriteAsLong="true" reserved="0" shapeId="${id}" usesFillWindingRule="false" usesNonScalingStrokes="false" usesScalingStrokes="true">
      <edgeBounds type="RECT" Xmax="400" Xmin="0" Ymax="400" Ymin="0" nbits="11"/>
      <shapeBounds type="RECT" Xmax="400" Xmin="0" Ymax="400" Ymin="0" nbits="11"/>
      <shapes type="SHAPEWITHSTYLE" numFillBits="1" numLineBits="0">
        <fillStyles type="FILLSTYLEARRAY"><fillStyles><item type="FILLSTYLE" fillStyleType="0"><color type="RGBA" alpha="255" blue="0" green="0" red="255"/></item></fillStyles></fillStyles>
        <lineStyles type="LINESTYLEARRAY"><lineStyles2/></lineStyles>
        <shapeRecords>
          <item type="StyleChangeRecord" fillStyle1="1" moveBits="10" moveDeltaX="400" moveDeltaY="400" stateFillStyle0="false" stateFillStyle1="true" stateLineStyle="false" stateMoveTo="true" stateNewStyles="false"/>
          <item type="StraightEdgeRecord" deltaX="-400" generalLineFlag="false" numBits="10" vertLineFlag="false"/>
          <item type="StraightEdgeRecord" deltaY="-400" generalLineFlag="false" numBits="10" vertLineFlag="true"/>
          <item type="StraightEdgeRecord" deltaX="400" generalLineFlag="false" numBits="10" vertLineFlag="false"/>
          <item type="StraightEdgeRecord" deltaY="400" generalLineFlag="false" numBits="10" vertLineFlag="true"/>
          <item type="EndShapeRecord" endOfShape="0"/>
        </shapeRecords>
      </shapes>
    </item>`;
}

function sprite(id: number, shapeId: number): string {
  return `<item type="DefineSpriteTag" forceWriteAsLong="false" frameCount="1" hasEndTag="true" spriteId="${id}">
      <subTags>
        <item type="PlaceObject2Tag" characterId="${shapeId}" depth="1" forceWriteAsLong="false" placeFlagHasCharacter="true" placeFlagHasClipActions="false" placeFlagHasClipDepth="false" placeFlagHasColorTransform="false" placeFlagHasMatrix="true" placeFlagHasName="false" placeFlagHasRatio="false" placeFlagMove="false">
          <matrix type="MATRIX" hasRotate="false" hasScale="false" nRotateBits="0" nScaleBits="0" nTranslateBits="1" translateX="0" translateY="0"/>
        </item>
        <item type="ShowFrameTag" forceWriteAsLong="false"/>
      </subTags>
    </item>`;
}

/** The skeleton XML. */
export function symbolClassSkeletonXml(): string {
  const { shape: s, spriteA, spriteB } = SYMBOL_CLASS_IDS;
  return `<?xml version="1.0" encoding="UTF-8"?>
<swf _xmlExportMajor="4" _xmlExportMinor="2" _generator="JPEXS Free Flash Decompiler v.26.4.0" type="SWF" charset="UTF-8" compression="ZLIB" encrypted="false" frameCount="1" frameRate="24.0" gfx="false" hasEndTag="true" version="15">
  <displayRect type="RECT" Xmax="4000" Xmin="0" Ymax="4000" Ymin="0" nbits="13"/>
  <tags>
    <item type="FileAttributesTag" actionScript3="true" brokerLocalConnection="false" brokerProductManager="false" forceWriteAsLong="false" hasMetadata="false" noCrossDomainCache="false" reservedA="false" reservedC="0" swfRelativeUrls="false" useDirectBlit="false" useGPU="false" useNetwork="false"/>
    ${shape(s)}
    ${sprite(spriteA, s)}
    ${sprite(spriteB, s)}
    ${SYMBOL_CLASS_ITEMS.map((p) => pairsXml('SymbolClassTag', p)).join('\n    ')}
    ${pairsXml('ExportAssetsTag', EXPORT_ASSET_PAIRS)}
    <item type="ShowFrameTag" forceWriteAsLong="false"/>
  </tags>
</swf>
`;
}

export interface SymbolClassMeasure {
  /** Lines of symbols.csv exactly as FFDec wrote them (empty lines dropped, ANSI none). */
  csvLines: string[];
  /** The `-swf2xml` dump of the generated SWF. */
  dump: string;
}

function ffdec(args: string[]): void {
  const r = spawnSync('java', ['-jar', BUTTON_FFDEC_JAR, ...args], { encoding: 'utf8', windowsHide: true, timeout: 90_000 });
  if (r.status !== 0) throw new Error(`ffdec ${args[0]} failed (${r.status}): ${r.stdout}${r.stderr}`);
}

/** Builds the SWF, exports symbolClass and dumps the tags. Throws with FFDec's output on failure. */
export function measureSymbolClassSwf(): SymbolClassMeasure {
  const dir = mkdtempSync(join(tmpdir(), 'symbolclass-swf-'));
  try {
    const xml = join(dir, 'in.xml');
    const swf = join(dir, 's.swf');
    const out = join(dir, 'out.xml');
    const exp = join(dir, 'exp');
    writeFileSync(xml, symbolClassSkeletonXml());
    ffdec(['-xml2swf', xml, swf]);
    ffdec(['-swf2xml', swf, out]);
    ffdec(['-export', 'shape,script,symbolClass', exp, swf]);
    const csv = join(exp, 'symbolClass', 'symbols.csv');
    if (!existsSync(out)) throw new Error('ffdec -swf2xml wrote no file');
    if (!existsSync(csv)) throw new Error('ffdec -export symbolClass wrote no symbols.csv');
    const csvLines = readFileSync(csv, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
    return { csvLines, dump: readFileSync(out, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
