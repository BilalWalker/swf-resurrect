import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseServerOptions } from '../../web/server/options';

const root = join('/', 'repo');

describe('parseServerOptions', () => {
  it('has safe defaults', () => {
    expect(parseServerOptions([], {}, root)).toEqual({
      ok: true,
      options: {
        port: 5180,
        host: '127.0.0.1',
        dev: false,
        timeoutMs: 180_000,
        ffdecJar: join(root, 'tools', 'ffdec', 'ffdec-cli.jar'),
        retention: { maxAgeMs: 72 * 3600_000, maxTotalBytes: 2048 * 1024 * 1024, maxJobs: 100, orphanGraceMs: 3600_000 },
        sweepIntervalMs: 600_000,
        production: false,
        rateLimit: null,
        trustProxyHops: 0,
        uploadsEnabled: true,
      },
    });
  });

  it('turns the rate limit on in production unless told otherwise', () => {
    expect(parseServerOptions([], { NODE_ENV: 'production' }, root)).toMatchObject({
      ok: true,
      options: { production: true, rateLimit: { burst: 3, perHour: 10 } },
    });
    expect(parseServerOptions([], { NODE_ENV: 'production', SWF_RESURRECT_RATE_LIMIT: 'off' }, root)).toMatchObject({ ok: true, options: { rateLimit: null } });
    expect(
      parseServerOptions([], { SWF_RESURRECT_RATE_LIMIT: 'on', SWF_RESURRECT_RATE_BURST: '5', SWF_RESURRECT_RATE_PER_HOUR: '20' }, root),
    ).toMatchObject({ ok: true, options: { production: false, rateLimit: { burst: 5, perHour: 20 } } });
  });

  it('turns uploads off with SWF_RESURRECT_UPLOADS=off', () => {
    expect(parseServerOptions([], { SWF_RESURRECT_UPLOADS: 'off' }, root)).toMatchObject({ ok: true, options: { uploadsEnabled: false } });
    expect(parseServerOptions([], { SWF_RESURRECT_UPLOADS: 'on' }, root)).toMatchObject({ ok: true, options: { uploadsEnabled: true } });
    expect(parseServerOptions([], { SWF_RESURRECT_UPLOADS: 'no' }, root).ok).toBe(false);
  });

  it('reads TRUST_PROXY as a number of hops', () => {
    expect(parseServerOptions([], { TRUST_PROXY: '1' }, root)).toMatchObject({ ok: true, options: { trustProxyHops: 1 } });
    expect(parseServerOptions([], { TRUST_PROXY: '0' }, root)).toMatchObject({ ok: true, options: { trustProxyHops: 0 } });
  });

  it('reads the retention limits, 0 meaning no limit', () => {
    const r = parseServerOptions(
      [],
      { SWF_RESURRECT_KEEP_HOURS: '0', SWF_RESURRECT_KEEP_MB: '500', SWF_RESURRECT_KEEP_JOBS: '7', SWF_RESURRECT_SWEEP_MINUTES: '1' },
      root,
    );
    expect(r).toMatchObject({
      ok: true,
      options: { retention: { maxAgeMs: 0, maxTotalBytes: 500 * 1024 * 1024, maxJobs: 7 }, sweepIntervalMs: 60_000 },
    });
  });

  it('reads the environment, and flags win over PORT', () => {
    const r = parseServerOptions(['--dev', '--port', '6000'], { PORT: '7000', HOST: '0.0.0.0', SWF_RESURRECT_FFDEC: 'D:\\f.jar', SWF_RESURRECT_TIMEOUT_S: '30' }, root);
    expect(r).toMatchObject({ ok: true, options: { port: 6000, host: '0.0.0.0', dev: true, timeoutMs: 30_000, ffdecJar: 'D:\\f.jar' } });
    expect(parseServerOptions([], { PORT: '7000' }, root)).toMatchObject({ ok: true, options: { port: 7000 } });
    expect(parseServerOptions(['--port', '0'], {}, root)).toMatchObject({ ok: true, options: { port: 0 } });
  });

  it('refuses bad values', () => {
    for (const [argv, env] of [
      [['--port'], {}],
      [['--port', 'abc'], {}],
      [['--port', '70000'], {}],
      [['--frobnicate'], {}],
      [[], { PORT: 'x' }],
      [[], { SWF_RESURRECT_TIMEOUT_S: '0' }],
      [[], { SWF_RESURRECT_TIMEOUT_S: '-5' }],
      [[], { SWF_RESURRECT_KEEP_HOURS: '1.5' }],
      [[], { SWF_RESURRECT_KEEP_MB: '-1' }],
      [[], { SWF_RESURRECT_KEEP_JOBS: 'many' }],
      [[], { SWF_RESURRECT_RATE_LIMIT: 'yes' }],
      [[], { SWF_RESURRECT_RATE_BURST: '0' }],
      [[], { SWF_RESURRECT_RATE_PER_HOUR: '1.5' }],
      [[], { TRUST_PROXY: 'true' }],
    ] as const) {
      expect(parseServerOptions(argv, env, root).ok).toBe(false);
    }
  });
});
