/** Builders for minimal FFDec swf2xml dumps used by the matrix preservation tests. */

export function wrapDump(items: string, major = '4'): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<swf _xmlExportMajor="${major}" _xmlExportMinor="2" frameCount="1" frameRate="24.0" type="SWF">\n` +
    `  <displayRect type="RECT" Xmax="11000" Xmin="0" Ymax="8000" Ymin="0" nbits="15"/>\n` +
    `  <tags>\n${items}\n  </tags>\n</swf>\n`
  );
}

/** A PlaceObject2Tag item; `matrixAttrs` null means no matrix child. */
export function placeItem(matrixAttrs: string | null): string {
  return (
    `<item type="PlaceObject2Tag" characterId="1" depth="2" placeFlagHasCharacter="true" ` +
    `placeFlagHasMatrix="${matrixAttrs !== null}" placeFlagMove="false">` +
    `${matrixAttrs !== null ? `<matrix type="MATRIX" ${matrixAttrs}/>` : ''}</item>`
  );
}
