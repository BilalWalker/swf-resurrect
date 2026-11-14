import { describe, expect, it } from 'vitest';
import { cacheKey, displayName, hasSwfMagic, isJobId, isSampleName, newJobId } from '../../web/server/upload';

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('hasSwfMagic', () => {
  it('accepts the three SWF signatures', () => {
    for (const sig of ['FWS', 'CWS', 'ZWS']) expect(hasSwfMagic(bytes(`${sig}\x0a\x00\x00\x00\x00`))).toBe(true);
  });
  it('refuses other files and short input', () => {
    expect(hasSwfMagic(bytes('PK\x03\x04aaaa'))).toBe(false);
    expect(hasSwfMagic(bytes('fws\x0a\x00\x00\x00\x00'))).toBe(false);
    expect(hasSwfMagic(bytes('<html>hello'))).toBe(false);
    expect(hasSwfMagic(bytes('FWS'))).toBe(false);
    expect(hasSwfMagic(new Uint8Array())).toBe(false);
  });
});

describe('displayName', () => {
  it('keeps an ordinary name', () => {
    expect(displayName('game.swf')).toBe('game.swf');
    expect(displayName('My Game (v2).SWF')).toBe('My Game (v2).swf');
  });
  it('drops directories, traversal and markup', () => {
    expect(displayName('../../etc/passwd')).toBe('passwd.swf');
    expect(displayName('C:\\Users\\x\\evil.swf')).toBe('evil.swf');
    expect(displayName('%2e%2e%2fsecret.swf')).toBe('secret.swf');
    expect(displayName('<b>x</b>.swf')).toBe('b.swf'); // the slash ends a path component
    expect(displayName('<img onerror=x>.swf')).toBe('img onerrorx.swf');
    expect(displayName('..swf')).toBe('upload.swf');
  });
  it('falls back for empty or missing names and caps the length', () => {
    expect(displayName(undefined)).toBe('upload.swf');
    expect(displayName('')).toBe('upload.swf');
    expect(displayName('%')).toBe('upload.swf');
    expect(displayName(`${'a'.repeat(200)}.swf`).length).toBe(80);
  });
});

describe('cacheKey and ids', () => {
  it('is the SHA-256 of the bytes', () => {
    expect(cacheKey(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('makes distinct, well-formed job ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newJobId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(isJobId(id)).toBe(true);
    expect(isJobId('../../x')).toBe(false);
    expect(isJobId('ABCDEF0123456789abcdef01')).toBe(false);
  });
  it('accepts only plain sample names', () => {
    expect(isSampleName('clickgoto')).toBe(true);
    expect(isSampleName('tween_demo-2')).toBe(true);
    expect(isSampleName('..')).toBe(false);
    expect(isSampleName('a/b')).toBe(false);
    expect(isSampleName('LICENSES')).toBe(true); // filtered by the gallery, which needs test.swf
  });
});
