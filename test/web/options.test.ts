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
      },
    });
  });

  it('reads the environment, and flags win over PORT', () => {
    const r = parseServerOptions(['--dev', '--port', '6000'], { PORT: '7000', HOST: '0.0.0.0', SWF_RESURRECT_FFDEC: 'D:\\f.jar', SWF_RESURRECT_TIMEOUT_S: '30' }, root);
    expect(r).toEqual({ ok: true, options: { port: 6000, host: '0.0.0.0', dev: true, timeoutMs: 30_000, ffdecJar: 'D:\\f.jar' } });
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
    ] as const) {
      expect(parseServerOptions(argv, env, root).ok).toBe(false);
    }
  });
});
