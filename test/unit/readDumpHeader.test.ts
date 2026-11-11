import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkXmlVersion, isAs3Dump, readDumpHeader } from '../../src/convert/ffdecXml';
import { MissingHeaderValueError, XmlVersionError } from '../../src/unpack/errors';

const xml = readFileSync(new URL('../fixtures/clickgoto/structure.xml', import.meta.url), 'utf8');

describe('readDumpHeader', () => {
  it('reads 550 x 400, 24 fps, 3 frames and version 4.2 from the captured dump', () => {
    const { xmlVersion, header } = readDumpHeader(xml);
    expect(header).toEqual({ widthPx: 550, heightPx: 400, frameRate: 24, frameCount: 3 });
    expect(xmlVersion).toEqual({ major: 4, minor: 2 });
    expect(() => checkXmlVersion(xmlVersion)).not.toThrow();
  });

  it('names every missing or non-finite value', () => {
    const bad = '<swf _xmlExportMajor="4" _xmlExportMinor="2" frameRate="abc"><tags/></swf>';
    try {
      readDumpHeader(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MissingHeaderValueError);
      expect((e as MissingHeaderValueError).names).toEqual(['frameRate', 'frameCount', 'stageRect']);
    }
  });

  it('rejects an unsupported major version', () => {
    expect(() => checkXmlVersion({ major: 5, minor: 0 })).toThrow(XmlVersionError);
  });

  it('detects the AS3 flag', () => {
    expect(isAs3Dump(xml.slice(0, 65536))).toBe(true);
    expect(isAs3Dump(xml.replace('actionScript3="true"', 'actionScript3="false"'))).toBe(false);
    expect(isAs3Dump('<swf><tags/></swf>')).toBe(false);
  });
});
