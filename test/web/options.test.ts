import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKSTOP_MARGIN_S, backstopMs, parseServerOptions } from '../../web/server/options';
import { pipelineArgs } from '../../web/server/processTree';

const root = join('/', 'repo');

describe('parseServerOptions', () => {
  it('has safe defaults', () => {
    expect(parseServerOptions([], {}, root)).toEqual({
      ok: true,
      options: {
        port: 5180,
        host: '127.0.0.1',
        dev: false,
        timeoutMs: 300_000,
        ffdecJar: join(root, 'tools', 'ffdec', 'ffdec-cli.jar'),
        retention: { maxAgeMs: 72 * 3600_000, maxTotalBytes: 2048 * 1024 * 1024, maxJobs: 100, orphanGraceMs: 3600_000 },
        sweepIntervalMs: 600_000,
        production: false,
        rateLimit: null,
        trustProxyHops: 0,
        uploadsEnabled: true,
        frameAncestors: [],
      },
    });
  });

  it('reads SWF_RESURRECT_FRAME_ANCESTORS as a list of https origins', () => {
    expect(parseServerOptions([], { SWF_RESURRECT_FRAME_ANCESTORS: '' }, root)).toMatchObject({ ok: true, options: { frameAncestors: [] } });
    expect(
      parseServerOptions([], { SWF_RESURRECT_FRAME_ANCESTORS: ' https://huggingface.co  https://example.org:8443 ' }, root),
    ).toMatchObject({ ok: true, options: { frameAncestors: ['https://huggingface.co', 'https://example.org:8443'] } });
    for (const bad of [
      'http://huggingface.co',
      'https://huggingface.co/',
      'https://huggingface.co/spaces',
      'https://huggingface.co?x=1',
      'https://*.hf.space',
      '*',
      'huggingface.co',
      "https://a.org;script-src 'unsafe-inline'",
      'https://user@a.org',
    ]) {
      const r = parseServerOptions([], { SWF_RESURRECT_FRAME_ANCESTORS: `https://huggingface.co ${bad}` }, root);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/^SWF_RESURRECT_FRAME_ANCESTORS must be origins like https:\/\/example\.org/);
    }
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

  it('passes the run limit to the pipeline and kills only after the backstop margin', () => {
    const r = parseServerOptions([], { SWF_RESURRECT_TIMEOUT_S: '240' }, root);
    if (!r.ok) throw new Error(r.message);
    const args = pipelineArgs({ repoRoot: root, swfPath: 'a.swf', outDir: 'o', workDir: 'w', ffdecJar: 'f.jar', runLimitS: r.options.timeoutMs / 1000 });
    expect(args.slice(args.indexOf('--run-limit'), args.indexOf('--run-limit') + 2)).toEqual(['--run-limit', '240']);
    expect(backstopMs(r.options.timeoutMs)).toBe(240_000 + BACKSTOP_MARGIN_S * 1000);
    expect(BACKSTOP_MARGIN_S).toBeGreaterThan(0);
  });
});
