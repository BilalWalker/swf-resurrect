// Checks on untrusted uploads, the cache key and job ids. Pure apart from crypto.
import { createHash, randomBytes } from 'node:crypto';

/** Largest SWF the server accepts (20 MB). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** FWS (uncompressed), CWS (zlib) and ZWS (LZMA) are the three SWF signatures. */
export function hasSwfMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  return sig === 'FWS' || sig === 'CWS' || sig === 'ZWS';
}

/**
 * A client-supplied file name made safe for display (never used in a path): the last path
 * component, percent-decoded when possible, control and markup characters dropped, at most 80
 * characters, always ending in `.swf`.
 */
export function displayName(raw: string | undefined): string {
  let name = raw ?? '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the raw text
  }
  name = name.split(/[\\/]/).pop() ?? '';
  name = name.replace(/[^\p{L}\p{N} ._()\-]/gu, '').replace(/\s+/g, ' ').trim();
  if (name.toLowerCase().endsWith('.swf')) name = name.slice(0, -4);
  name = name.replace(/^[.\s]+/, '');
  if (name.length > 76) name = name.slice(0, 76).trim();
  if (name === '') name = 'upload';
  return `${name}.swf`;
}

/** Cache key: SHA-256 of the SWF bytes, lower-case hex. */
export function cacheKey(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const JOB_ID = /^[a-f0-9]{24}$/;

/** 96 random bits from the OS CSPRNG, hex. Never a sequence number. */
export function newJobId(): string {
  return randomBytes(12).toString('hex');
}

export function isJobId(s: string): boolean {
  return JOB_ID.test(s);
}

/** Sample directory names the server accepts in a URL. */
export function isSampleName(s: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(s);
}
