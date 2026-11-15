// Per-client token buckets for job creation. Pure apart from the Map; the clock is passed in.

export interface RateLimit {
  /** Jobs a client may start at once (bucket size). */
  burst: number;
  /** Tokens added per hour (steady rate). */
  perHour: number;
}

export type TakeResult = { ok: true } | { ok: false; retryAfterS: number };

interface Bucket {
  tokens: number;
  atMs: number;
}

export class TokenBuckets {
  private readonly buckets = new Map<string, Bucket>();
  private readonly perMs: number;

  constructor(
    private readonly limit: RateLimit,
    /** Most clients remembered; full buckets are forgotten first, then the least recent. */
    private readonly maxClients = 10_000,
  ) {
    this.perMs = limit.perHour / 3600_000;
  }

  private level(b: Bucket, nowMs: number): number {
    return Math.min(this.limit.burst, b.tokens + Math.max(0, nowMs - b.atMs) * this.perMs);
  }

  /** Takes one token for `key`, or says how many seconds until one is available. */
  take(key: string, nowMs: number): TakeResult {
    const b = this.buckets.get(key);
    const tokens = b === undefined ? this.limit.burst : this.level(b, nowMs);
    if (tokens < 1) {
      const waitMs = this.perMs > 0 ? (1 - tokens) / this.perMs : Infinity;
      return { ok: false, retryAfterS: Number.isFinite(waitMs) ? Math.max(1, Math.ceil(waitMs / 1000)) : 3600 };
    }
    // Re-insert so Map order is least recently used first.
    this.buckets.delete(key);
    this.buckets.set(key, { tokens: tokens - 1, atMs: nowMs });
    if (this.buckets.size > this.maxClients) this.prune(nowMs);
    return { ok: true };
  }

  private prune(nowMs: number): void {
    for (const [k, b] of this.buckets) {
      if (this.level(b, nowMs) >= this.limit.burst) this.buckets.delete(k);
    }
    for (const k of this.buckets.keys()) {
      if (this.buckets.size <= this.maxClients) break;
      this.buckets.delete(k);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}
