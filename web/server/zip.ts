// A small zip writer (PKWARE APPNOTE 6.3, no Zip64): stored or deflated entries, UTF-8 names.
// Pure apart from node:zlib. Projects are small, so the whole archive is built in memory.
import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** Forward-slash path inside the archive, no leading slash. */
  name: string;
  data: Uint8Array;
  mtime: Date;
}

const LIMIT = 0xffffffff;

/** MS-DOS date and time (local time, 2-second resolution, years 1980-2107). */
export function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date, time };
}

function checkName(name: string): void {
  if (name === '' || name.startsWith('/') || name.includes('\\') || name.split('/').some((s) => s === '..' || s === '')) {
    throw new Error(`bad zip entry name: ${name}`);
  }
}

export function buildZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length > 0xffff) throw new Error('too many zip entries');
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    checkName(e.name);
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const deflated = deflateRawSync(e.data, { level: 9 });
    const useDeflate = deflated.length < e.data.length;
    const body = useDeflate ? deflated : Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    if (e.data.length > LIMIT || body.length > LIMIT || offset > LIMIT) throw new Error('zip too large (no Zip64)');
    const { date, time } = dosDateTime(e.mtime);
    const method = useDeflate ? 8 : 0;
    const flags = 0x0800; // bit 11: names are UTF-8

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by: 2.0, MS-DOS attributes
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra length, comment length, disk number, internal attributes: 0
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  if (offset > LIMIT) throw new Error('zip too large (no Zip64)');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
