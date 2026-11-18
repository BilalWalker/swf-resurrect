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
