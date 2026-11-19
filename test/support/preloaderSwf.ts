import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buttonSwfSkipReason } from './buttonSwf';
import { ffdec, pairsXml, shape, sprite } from './symbolClassSwf';

/**
 * Preloader fixture (robustness task 31.3, Requirement 27.7, design D-E2). A generated two-frame SWF in the
 * shape of a manual preloader file: frame 1 holds the document class pair (id 0), frame 2 holds a SymbolClass
 * pair for the main class, a sprite with a visible shape that no placement references. FFDec `-xml2swf`
 * builds it; there is no AS3 compiler here, so the file holds no DoABC and the classes are Fixture_Classes
 * (test/unit/preloaderPattern.test.ts). Nothing copyrighted.
 */
export const preloaderSwfSkipReason = buttonSwfSkipReason;

export const PRELOADER = { shape: 1, main: 2, documentClass: 'Preloader', mainClass: 'Main' } as const;

/** The skeleton XML: frame 1 links id 0; frame 2 links the unplaced sprite. */
export function preloaderSkeletonXml(): string {
  const { shape: s, main, documentClass, mainClass } = PRELOADER;
  return `<?xml version="1.0" encoding="UTF-8"?>
<swf _xmlExportMajor="4" _xmlExportMinor="2" _generator="JPEXS Free Flash Decompiler v.26.4.0" type="SWF" charset="UTF-8" compression="ZLIB" encrypted="false" frameCount="2" frameRate="24.0" gfx="false" hasEndTag="true" version="15">
  <displayRect type="RECT" Xmax="4000" Xmin="0" Ymax="4000" Ymin="0" nbits="13"/>
  <tags>
    <item type="FileAttributesTag" actionScript3="true" brokerLocalConnection="false" brokerProductManager="false" forceWriteAsLong="false" hasMetadata="false" noCrossDomainCache="false" reservedA="false" reservedC="0" swfRelativeUrls="false" useDirectBlit="false" useGPU="false" useNetwork="false"/>
    ${shape(s)}
    ${sprite(main, s)}
    ${pairsXml('SymbolClassTag', [[0, documentClass]])}
    <item type="ShowFrameTag" forceWriteAsLong="false"/>
    ${pairsXml('SymbolClassTag', [[main, mainClass]])}
    <item type="ShowFrameTag" forceWriteAsLong="false"/>
  </tags>
</swf>
`;
}

/** Builds the SWF with FFDec and returns its `-swf2xml` dump. Throws with FFDec's output on failure. */
export function dumpPreloaderSwf(): string {
  const dir = mkdtempSync(join(tmpdir(), 'preloader-swf-'));
  try {
    const xml = join(dir, 'in.xml');
    const swf = join(dir, 'p.swf');
    const out = join(dir, 'out.xml');
    writeFileSync(xml, preloaderSkeletonXml());
    ffdec(['-xml2swf', xml, swf]);
    ffdec(['-swf2xml', swf, out]);
    if (!existsSync(out)) throw new Error('ffdec -swf2xml wrote no file');
    return readFileSync(out, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
