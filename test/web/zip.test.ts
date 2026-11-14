import { describe, expect, it } from 'vitest';
import { crc32, inflateRawSync } from 'node:zlib';
import { buildZip, dosDateTime } from '../../web/server/zip';

interface ReadEntry {
  name: string;
  method: number;
  flags: number;
  data: Buffer;
  date: number;
  time: number;
}

/** Independent reader: walks the central directory, then each local header, and checks CRCs. */
function readZip(zip: Buffer): ReadEntry[] {
  const eocd = zip.length - 22;
  expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
  const count = zip.readUInt16LE(eocd + 10);
  const cdSize = zip.readUInt32LE(eocd + 12);
  let p = zip.readUInt32LE(eocd + 16);
  expect(p + cdSize).toBe(eocd);
  const out: ReadEntry[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const time = zip.readUInt16LE(p + 12);
    const date = zip.readUInt16LE(p + 14);
    const crc = zip.readUInt32LE(p + 16);
    const csize = zip.readUInt32LE(p + 20);
    const usize = zip.readUInt32LE(p + 24);
    const nlen = zip.readUInt16LE(p + 28);
    const xlen = zip.readUInt16LE(p + 30);
    const clen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nlen).toString('utf8');
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    expect(zip.readUInt32LE(local + 14)).toBe(crc);
    const lnlen = zip.readUInt16LE(local + 26);
    const lxlen = zip.readUInt16LE(local + 28);
    const body = zip.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    expect(data.length).toBe(usize);
    expect(crc32(data)).toBe(crc);
    out.push({ name, method, flags, data, date, time });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

const when = new Date(2026, 10, 13, 17, 30, 45);

describe('buildZip', () => {
  it('round-trips stored and deflated entries with UTF-8 names', () => {
    const text = Buffer.from('export const x = 1;\n'.repeat(200));
    const random = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 97 + 13) & 0xff));
    const zip = buildZip([
      { name: 'proj/src/main.ts', data: text, mtime: when },
      { name: 'proj/assets/r.bin', data: random, mtime: when },
      { name: 'proj/empty.txt', data: new Uint8Array(), mtime: when },
      { name: 'proj/naïve-ü.txt', data: Buffer.from('ok'), mtime: when },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['proj/src/main.ts', 'proj/assets/r.bin', 'proj/empty.txt', 'proj/naïve-ü.txt']);
    expect(entries[0].method).toBe(8);
    expect(entries[0].data.equals(text)).toBe(true);
    expect(entries[1].method).toBe(0);
    expect(entries[1].data.equals(random)).toBe(true);
    expect(entries[2].data.length).toBe(0);
    expect(entries[3].data.toString()).toBe('ok');
    for (const e of entries) expect(e.flags & 0x0800).toBe(0x0800);
    expect(entries[0].date).toBe(dosDateTime(when).date);
  });

  it('writes an empty archive', () => {
    const zip = buildZip([]);
    expect(zip.length).toBe(22);
    expect(readZip(zip)).toEqual([]);
  });

  it('encodes DOS date and time', () => {
    const { date, time } = dosDateTime(when);
    expect(date >> 9).toBe(2026 - 1980);
    expect((date >> 5) & 0xf).toBe(11);
    expect(date & 0x1f).toBe(13);
    expect(time >> 11).toBe(17);
    expect((time >> 5) & 0x3f).toBe(30);
    expect((time & 0x1f) * 2).toBe(44);
    expect(dosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0);
  });

  it('refuses unsafe entry names', () => {
    for (const name of ['../x', '/abs', 'a\\b', 'a//b', '']) {
      expect(() => buildZip([{ name, data: new Uint8Array(), mtime: when }])).toThrow();
    }
  });
});
