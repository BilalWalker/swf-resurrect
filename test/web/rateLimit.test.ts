import { describe, expect, it } from 'vitest';
import { clientAddress, normaliseAddress } from '../../web/server/clientAddress';
import { TokenBuckets } from '../../web/server/rateLimit';

const MIN = 60_000;

describe('TokenBuckets', () => {
  it('allows a burst, then refills at the hourly rate', () => {
    const b = new TokenBuckets({ burst: 2, perHour: 6 }); // one token every 10 minutes
    expect(b.take('a', 0)).toEqual({ ok: true });
    expect(b.take('a', 0)).toEqual({ ok: true });
    expect(b.take('a', 0)).toEqual({ ok: false, retryAfterS: 600 });
    expect(b.take('a', 4 * MIN)).toEqual({ ok: false, retryAfterS: 360 });
    expect(b.take('a', 10 * MIN)).toEqual({ ok: true });
    expect(b.take('a', 10 * MIN).ok).toBe(false);
  });

  it('keeps clients apart', () => {
    const b = new TokenBuckets({ burst: 1, perHour: 1 });
    expect(b.take('a', 0).ok).toBe(true);
    expect(b.take('b', 0).ok).toBe(true);
    expect(b.take('a', 0).ok).toBe(false);
  });

  it('never refills beyond the burst', () => {
    const b = new TokenBuckets({ burst: 2, perHour: 60 });
    b.take('a', 0);
    const later = 100 * 60 * MIN;
    expect(b.take('a', later).ok).toBe(true);
    expect(b.take('a', later).ok).toBe(true);
    expect(b.take('a', later).ok).toBe(false);
  });

  it('with no refill says to retry in an hour', () => {
    const b = new TokenBuckets({ burst: 1, perHour: 0 });
    b.take('a', 0);
    expect(b.take('a', 0)).toEqual({ ok: false, retryAfterS: 3600 });
  });

  it('forgets full buckets first, then the least recent, to stay bounded', () => {
    const b = new TokenBuckets({ burst: 1, perHour: 60 }, 3);
    b.take('old', 0); // full again after a minute
    b.take('x', 5 * MIN - 1);
    b.take('y', 5 * MIN - 1);
    b.take('z', 5 * MIN - 1); // 4 clients > 3: 'old' is full and goes
    expect(b.size).toBe(3);
    // 'x' is still empty, so it was kept.
    expect(b.take('x', 5 * MIN).ok).toBe(false);
  });
});

describe('clientAddress', () => {
  it('uses the socket peer unless proxies are trusted', () => {
    expect(clientAddress('::ffff:10.0.0.1', '1.2.3.4', 0)).toBe('10.0.0.1');
    expect(clientAddress('127.0.0.1', undefined, 1)).toBe('127.0.0.1');
    expect(clientAddress(undefined, undefined, 0)).toBe('unknown');
  });

  it('takes the entry written by the outermost trusted proxy', () => {
    // Client spoofs "6.6.6.6"; the one trusted proxy appends the real peer.
    expect(clientAddress('10.0.0.2', '6.6.6.6, 203.0.113.9', 1)).toBe('203.0.113.9');
    // Two proxies: the client is second from the right.
    expect(clientAddress('10.0.0.2', '6.6.6.6, 203.0.113.9, 10.0.0.5', 2)).toBe('203.0.113.9');
    // Repeated headers are joined.
    expect(clientAddress('10.0.0.2', ['6.6.6.6', '203.0.113.9'], 1)).toBe('203.0.113.9');
    // Fewer entries than hops: the leftmost.
    expect(clientAddress('10.0.0.2', '203.0.113.9', 3)).toBe('203.0.113.9');
  });

  it('falls back to the peer when the header is empty or not an address', () => {
    expect(clientAddress('10.0.0.2', ' , ', 1)).toBe('10.0.0.2');
    expect(clientAddress('10.0.0.2', 'evil<script>', 1)).toBe('10.0.0.2');
  });

  it('normalises addresses', () => {
    expect(normaliseAddress('[2001:DB8::1]:443')).toBe('2001:db8::1');
    expect(normaliseAddress('198.51.100.7:5000')).toBe('198.51.100.7');
    expect(normaliseAddress('::FFFF:198.51.100.7')).toBe('198.51.100.7');
    expect(normaliseAddress('unknown')).toBeNull();
  });
});
