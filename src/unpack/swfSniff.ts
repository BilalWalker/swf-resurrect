import { open } from 'node:fs/promises';
import { InvalidSwfError } from './errors';

const SIGNATURES = ['FWS', 'CWS', 'ZWS'];

/** True when the first three bytes are FWS, CWS or ZWS. */
export function isSwfSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);
  return SIGNATURES.includes(sig);
}

/** Throws InvalidSwfError unless the file exists, is readable and has a SWF signature. */
export async function assertValidSwfFile(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'r');
    const buf = new Uint8Array(3);
    const { bytesRead } = await handle.read(buf, 0, 3, 0);
    if (!isSwfSignature(buf.subarray(0, bytesRead))) throw new InvalidSwfError(path);
  } catch (err) {
    if (err instanceof InvalidSwfError) throw err;
    throw new InvalidSwfError(path);
  } finally {
    await handle?.close();
  }
}
