import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Button fixture (robustness design D-C7, finding F3). An XML skeleton with two shapes, one
 * `DefineButtonTag` and one `DefineButton2Tag` is turned into a SWF by FFDec `-xml2swf`, and that
 * SWF is dumped again by `-swf2xml`. The dump is what the names are measured on ("measured on a
 * generated file", Requirement 20.3, Open_Item O11). Nothing copyrighted is involved.
 */

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const BUTTON_FFDEC_JAR = resolve(repoRoot, 'tools/ffdec/ffdec-cli.jar');

/** Why the round trip cannot run here, or null when Java and the FFDec jar are present. */
export function buttonSwfSkipReason(): string | null {
  if (spawnSync('java', ['-version'], { windowsHide: true }).status !== 0) return 'Java is not available on PATH';
  if (!existsSync(BUTTON_FFDEC_JAR)) return 'tools/ffdec is absent';
  return null;
}

/** Ids used by the skeleton. */
export const BUTTON_IDS = { shapeA: 1, shapeB: 2, buttonV1: 3, buttonV2: 4 } as const;

const MATRIX = (tx: number, ty: number): string =>
  `<placeMatrix type="MATRIX" hasRotate="false" hasScale="false" nRotateBits="0" nScaleBits="0" nTranslateBits="12" translateX="${tx}" translateY="${ty}"/>`;

function shape(id: number, red: number): string {
  return `<item type="DefineShape4Tag" forceWriteAsLong="true" reserved="0" shapeId="${id}" usesFillWindingRule="false" usesNonScalingStrokes="false" usesScalingStrokes="true">
      <edgeBounds type="RECT" Xmax="400" Xmin="0" Ymax="400" Ymin="0" nbits="11"/>
      <shapeBounds type="RECT" Xmax="400" Xmin="0" Ymax="400" Ymin="0" nbits="11"/>
      <shapes type="SHAPEWITHSTYLE" numFillBits="1" numLineBits="0">
        <fillStyles type="FILLSTYLEARRAY"><fillStyles><item type="FILLSTYLE" fillStyleType="0"><color type="RGBA" alpha="255" blue="0" green="0" red="${red}"/></item></fillStyles></fillStyles>
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

function record(characterId: number, depth: number, flags: { up?: boolean; over?: boolean; down?: boolean; hit?: boolean }, v2: boolean): string {
  const b = (v: boolean | undefined): string => (v ? 'true' : 'false');
  const cx = v2 ? '<colorTransform type="CXFORMWITHALPHA" hasAddTerms="false" hasMultTerms="false" nbits="1"/>' : '';
  return `<item type="BUTTONRECORD" buttonHasBlendMode="false" buttonHasFilterList="false" buttonStateDown="${b(flags.down)}" buttonStateHitTest="${b(flags.hit)}" buttonStateOver="${b(flags.over)}" buttonStateUp="${b(flags.up)}" characterId="${characterId}" placeDepth="${depth}" reserved="0">${MATRIX(0, 0)}${cx}</item>`;
}

/** The skeleton XML. Button v1: shape A in up and hit, shape B in over and down at depth 2. Button v2 trackAsMenu true. */
export function buttonSkeletonXml(): string {
  const { shapeA, shapeB, buttonV1, buttonV2 } = BUTTON_IDS;
  return `<?xml version="1.0" encoding="UTF-8"?>
<swf _xmlExportMajor="4" _xmlExportMinor="2" _generator="JPEXS Free Flash Decompiler v.26.4.0" type="SWF" charset="UTF-8" compression="ZLIB" encrypted="false" frameCount="1" frameRate="24.0" gfx="false" hasEndTag="true" version="15">
  <displayRect type="RECT" Xmax="4000" Xmin="0" Ymax="4000" Ymin="0" nbits="13"/>
  <tags>
    <item type="FileAttributesTag" actionScript3="true" brokerLocalConnection="false" brokerProductManager="false" forceWriteAsLong="false" hasMetadata="false" noCrossDomainCache="false" reservedA="false" reservedC="0" swfRelativeUrls="false" useDirectBlit="false" useGPU="false" useNetwork="false"/>
    ${shape(shapeA, 255)}
    ${shape(shapeB, 0)}
    <item type="DefineButtonTag" actionBytes="" buttonId="${buttonV1}" forceWriteAsLong="false">
      <characters>${record(shapeA, 1, { up: true, hit: true }, false)}${record(shapeB, 2, { over: true, down: true }, false)}</characters>
    </item>
    <item type="DefineButton2Tag" buttonId="${buttonV2}" forceWriteAsLong="false" reserved="0" trackAsMenu="true">
      <characters>${record(shapeA, 1, { up: true, over: true, down: true, hit: true }, true)}</characters>
      <actions/>
    </item>
    <item type="ShowFrameTag" forceWriteAsLong="false"/>
  </tags>
</swf>
`;
}

/** Runs xml2swf then swf2xml on the skeleton and returns the second dump. Throws with FFDec's output on failure. */
export function generateButtonDump(): string {
  const dir = mkdtempSync(join(tmpdir(), 'button-swf-'));
  try {
    const xml = join(dir, 'in.xml');
    const swf = join(dir, 'b.swf');
    const out = join(dir, 'out.xml');
    writeFileSync(xml, buttonSkeletonXml());
    for (const args of [['-xml2swf', xml, swf], ['-swf2xml', swf, out]]) {
      const r = spawnSync('java', ['-jar', BUTTON_FFDEC_JAR, ...args], { encoding: 'utf8', windowsHide: true, timeout: 90_000 });
      if (r.status !== 0) throw new Error(`ffdec ${args[0]} failed (${r.status}): ${r.stdout}${r.stderr}`);
    }
    if (!existsSync(out)) throw new Error('ffdec -swf2xml wrote no file');
    return readFileSync(out, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Play fixture (robustness task 23.1): the root timeline places one DefineButton2 at (50, 50) px, instance name `btn`, linked to
 * the class `BtnClass` (a hand-written override of the test supplies the class: there is no AS3 compiler here). The stage is
 * 300 x 200 px. Up is a red 100 x 100 px square, over green, down blue; the hit state is a 150 x 100 px rectangle, so
 * x 150..200 reacts although nothing is drawn there. Generated by FFDec `-xml2swf`; nothing copyrighted.
 */
export const BUTTON_PLAY = {
  className: 'BtnClass',
  instanceName: 'btn',
  /** Stage pixels. */
  stage: { width: 300, height: 200 },
  /** The button's top-left corner on the stage, and the size of each drawn state. */
  origin: { x: 50, y: 50 },
  drawn: { width: 100, height: 100 },
  hit: { width: 150, height: 100 },
  /** Fill colours [r, g, b] of the three drawn states. */
  colours: { up: [255, 0, 0], over: [0, 255, 0], down: [0, 0, 255] },
  ids: { up: 1, over: 2, down: 3, hit: 4, button: 5 },
} as const;

function rectShape(id: number, wPx: number, hPx: number, rgb: readonly number[]): string {
  const w = wPx * 20;
  const h = hPx * 20;
  return `<item type="DefineShape4Tag" forceWriteAsLong="true" reserved="0" shapeId="${id}" usesFillWindingRule="false" usesNonScalingStrokes="false" usesScalingStrokes="true">
      <edgeBounds type="RECT" Xmax="${w}" Xmin="0" Ymax="${h}" Ymin="0" nbits="14"/>
      <shapeBounds type="RECT" Xmax="${w}" Xmin="0" Ymax="${h}" Ymin="0" nbits="14"/>
      <shapes type="SHAPEWITHSTYLE" numFillBits="1" numLineBits="0">
        <fillStyles type="FILLSTYLEARRAY"><fillStyles><item type="FILLSTYLE" fillStyleType="0"><color type="RGBA" alpha="255" blue="${rgb[2]}" green="${rgb[1]}" red="${rgb[0]}"/></item></fillStyles></fillStyles>
        <lineStyles type="LINESTYLEARRAY"><lineStyles2/></lineStyles>
        <shapeRecords>
          <item type="StyleChangeRecord" fillStyle1="1" moveBits="14" moveDeltaX="${w}" moveDeltaY="${h}" stateFillStyle0="false" stateFillStyle1="true" stateLineStyle="false" stateMoveTo="true" stateNewStyles="false"/>
          <item type="StraightEdgeRecord" deltaX="${-w}" generalLineFlag="false" numBits="12" vertLineFlag="false"/>
          <item type="StraightEdgeRecord" deltaY="${-h}" generalLineFlag="false" numBits="12" vertLineFlag="true"/>
          <item type="StraightEdgeRecord" deltaX="${w}" generalLineFlag="false" numBits="12" vertLineFlag="false"/>
          <item type="StraightEdgeRecord" deltaY="${h}" generalLineFlag="false" numBits="12" vertLineFlag="true"/>
          <item type="EndShapeRecord" endOfShape="0"/>
        </shapeRecords>
      </shapes>
    </item>`;
}

/** The XML of the play fixture. */
export function buttonPlaySkeletonXml(): string {
  const { ids, colours, drawn, hit, origin, stage, className, instanceName } = BUTTON_PLAY;
  return `<?xml version="1.0" encoding="UTF-8"?>
<swf _xmlExportMajor="4" _xmlExportMinor="2" _generator="JPEXS Free Flash Decompiler v.26.4.0" type="SWF" charset="UTF-8" compression="ZLIB" encrypted="false" frameCount="1" frameRate="24.0" gfx="false" hasEndTag="true" version="15">
  <displayRect type="RECT" Xmax="${stage.width * 20}" Xmin="0" Ymax="${stage.height * 20}" Ymin="0" nbits="14"/>
  <tags>
    <item type="FileAttributesTag" actionScript3="true" brokerLocalConnection="false" brokerProductManager="false" forceWriteAsLong="false" hasMetadata="false" noCrossDomainCache="false" reservedA="false" reservedC="0" swfRelativeUrls="false" useDirectBlit="false" useGPU="false" useNetwork="false"/>
    ${rectShape(ids.up, drawn.width, drawn.height, colours.up)}
    ${rectShape(ids.over, drawn.width, drawn.height, colours.over)}
    ${rectShape(ids.down, drawn.width, drawn.height, colours.down)}
    ${rectShape(ids.hit, hit.width, hit.height, [255, 255, 0])}
    <item type="DefineButton2Tag" buttonId="${ids.button}" forceWriteAsLong="false" reserved="0" trackAsMenu="false">
      <characters>${record(ids.up, 1, { up: true }, true)}${record(ids.over, 1, { over: true }, true)}${record(ids.down, 1, { down: true }, true)}${record(ids.hit, 1, { hit: true }, true)}</characters>
      <actions/>
    </item>
    <item type="SymbolClassTag" forceWriteAsLong="true">
      <tags><item>${ids.button}</item></tags>
      <names><item>${className}</item></names>
    </item>
    <item type="PlaceObject2Tag" characterId="${ids.button}" depth="1" forceWriteAsLong="false" name="${instanceName}" placeFlagHasCharacter="true" placeFlagHasClipActions="false" placeFlagHasClipDepth="false" placeFlagHasColorTransform="false" placeFlagHasMatrix="true" placeFlagHasName="true" placeFlagHasRatio="false" placeFlagMove="false">
      <matrix type="MATRIX" hasRotate="false" hasScale="false" nRotateBits="0" nScaleBits="0" nTranslateBits="14" translateX="${origin.x * 20}" translateY="${origin.y * 20}"/>
    </item>
    <item type="ShowFrameTag" forceWriteAsLong="false"/>
  </tags>
</swf>
`;
}

/** Writes the play fixture SWF to `swfPath` through FFDec `-xml2swf`. Throws with FFDec's output on failure. */
export function writeButtonPlaySwf(swfPath: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'button-play-'));
  try {
    const xml = join(dir, 'in.xml');
    writeFileSync(xml, buttonPlaySkeletonXml());
    const r = spawnSync('java', ['-jar', BUTTON_FFDEC_JAR, '-xml2swf', xml, swfPath], { encoding: 'utf8', windowsHide: true, timeout: 90_000 });
    if (r.status !== 0 || !existsSync(swfPath)) throw new Error(`ffdec -xml2swf failed (${r.status}): ${r.stdout}${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
