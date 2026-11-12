import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FfdecExitError,
  FfdecNotFoundError,
  FfdecTimeoutError,
  InvalidSwfError,
  JavaNotFoundError,
  MissingExportError,
  MissingHeaderValueError,
  NotAs3Error,
  XmlVersionError,
} from '../../src/unpack/errors';
import type { FfdecSpawner, SpawnRequest } from '../../src/unpack/spawnFfdec';
import { hasSymbolClassTag, unpack } from '../../src/unpack/unpack';

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => childProcess);

const root = resolve(__dirname, '..', '..');
const tmpDirs: string[] = [];
let fixtureHead = '';

async function tmp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'swf-unpack-err-'));
  tmpDirs.push(d);
  return d;
}

beforeAll(async () => {
  const full = await readFile(join(root, 'test', 'fixtures', 'clickgoto', 'structure.xml'), 'utf8');
  // Small hand-editable head: prolog, root element, displayRect, FileAttributesTag only.
  const tagsAt = full.indexOf('<tags>');
  const faEnd = full.indexOf('/>', full.indexOf('type="FileAttributesTag"')) + 2;
  fixtureHead = `${full.slice(0, tagsAt)}<tags>\n    ${full.slice(full.indexOf('<item type="FileAttributesTag"'), faEnd)}\n  </tags>\n</swf>\n`;
});

afterAll(async () => {
  for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
  childProcess.spawn.mockReset();
});

interface Setup {
  swf: string;
  workDir: string;
  jar: string;
}

async function setup(opts: { jar?: boolean; swfBytes?: string } = {}): Promise<Setup> {
  const dir = await tmp();
  const swf = join(dir, 'in.swf');
  await writeFile(swf, opts.swfBytes ?? 'FWS\x09rest');
  const jar = join(dir, 'ffdec-cli.jar');
  if (opts.jar !== false) await writeFile(jar, 'jar');
  const workDir = join(dir, 'work');
  await mkdir(workDir);
  return { swf, workDir, jar };
}

/** Fake spawner: first call (-swf2xml) writes `xml`; second call (-export) creates the listed outputs. */
function fakeSpawner(workDir: string, xml: string, exports: string[] = ['shapes', 'scripts', 'symbolClass/symbols.csv']) {
  const calls: SpawnRequest[] = [];
  const spawner: FfdecSpawner = async (req) => {
    calls.push(req);
    if (req.args[0] === '-swf2xml') {
      await writeFile(req.args[2]!, xml);
    } else {
      for (const e of exports) {
        const p = join(workDir, e);
        if (e.endsWith('.csv')) {
          await mkdir(join(workDir, 'symbolClass'), { recursive: true });
          await writeFile(p, '0;"MainTimeline"\n');
        } else {
          await mkdir(p, { recursive: true });
        }
      }
    }
    return { stdout: '', stderr: '' };
  };
  return { calls, spawner };
}

describe('unpack error paths', () => {
  it('fixture head is a valid AS3 dump (control)', async () => {
    const s = await setup();
    const { spawner, calls } = fakeSpawner(s.workDir, fixtureHead);
    const r = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner });
    expect(calls).toHaveLength(2);
    expect(r.header.frameCount).toBe(3);
  });

  it('2.3 missing jar: FfdecNotFoundError, spawner not called, work dir unchanged', async () => {
    const s = await setup({ jar: false });
    const { spawner, calls } = fakeSpawner(s.workDir, fixtureHead);
    const err = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e) => e);
    expect(err).toBeInstanceOf(FfdecNotFoundError);
    expect(err.message).toContain(s.jar);
    expect(calls).toHaveLength(0);
    expect(await readdir(s.workDir)).toEqual([]);
  });

  it('2.4 non-zero exit carries code and ANSI-stripped stderr', () => {
    const err = new FfdecExitError(3, '\u001b[31mboom\u001b[0m');
    expect(err.exitCode).toBe(3);
    expect(err.stderrText).toBe('boom');
    expect(err.message).toContain('3');
    expect(err.message).toContain('boom');
    expect(err.message).not.toContain('\u001b');
  });

  it('2.4 unpack propagates a spawner exit error', async () => {
    const s = await setup();
    const spawner: FfdecSpawner = async () => {
      throw new FfdecExitError(1, 'bad');
    };
    await expect(unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner })).rejects.toBeInstanceOf(
      FfdecExitError,
    );
  });

  describe('real spawner with a fake child process', () => {
    async function realSpawn() {
      return (await import('../../src/unpack/spawnFfdec')).spawnFfdec;
    }
    const req: SpawnRequest = { javaCommand: 'java', jarPath: 'x.jar', args: ['-header', 'a.swf'], timeoutMs: 60_000 };

    function fakeChild() {
      const child = Object.assign(new EventEmitter(), {
        stdout: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
        stderr: Object.assign(new EventEmitter(), { setEncoding: vi.fn() }),
        kill: vi.fn(),
      });
      childProcess.spawn.mockReturnValue(child);
      return child;
    }

    it('2.5 timeout kills the process and rejects with the 60 second message', async () => {
      vi.useFakeTimers();
      const child = fakeChild();
      const spawnFfdec = await realSpawn();
      const p = spawnFfdec(req);
      const assertion = expect(p).rejects.toBeInstanceOf(FfdecTimeoutError);
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
      expect(child.kill).toHaveBeenCalledTimes(1);
      await expect(p).rejects.toThrow('60 second limit');
    });

    it('2.4 non-zero exit rejects with code and stripped stderr', async () => {
      const child = fakeChild();
      const spawnFfdec = await realSpawn();
      const p = spawnFfdec(req);
      child.stderr.emit('data', '\u001b[31mfailed\u001b[0m');
      child.emit('close', 2);
      const err = await p.catch((e) => e);
      expect(err).toBeInstanceOf(FfdecExitError);
      expect(err.exitCode).toBe(2);
      expect(err.stderrText).toBe('failed');
    });

    it('missing java (ENOENT) rejects with JavaNotFoundError', async () => {
      const child = fakeChild();
      const spawnFfdec = await realSpawn();
      const p = spawnFfdec(req);
      child.emit('error', Object.assign(new Error('spawn java ENOENT'), { code: 'ENOENT' }));
      const err = await p.catch((e) => e);
      expect(err).toBeInstanceOf(JavaNotFoundError);
      expect(err.message).toContain('Java 17+ required');
    });
  });

  it('2.6 AS2-only SWF stops before the export call', async () => {
    const s = await setup();
    const xml = fixtureHead.replace('actionScript3="true"', 'actionScript3="false"');
    expect(xml).not.toBe(fixtureHead);
    const { spawner, calls } = fakeSpawner(s.workDir, xml);
    await expect(unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner })).rejects.toBeInstanceOf(
      NotAs3Error,
    );
    expect(calls.map((c) => c.args[0])).toEqual(['-swf2xml']);
  });

  it('2.6 a dump without FileAttributesTag is treated as not AS3', async () => {
    const s = await setup();
    const xml = fixtureHead.replace('FileAttributesTag', 'SomeOtherTag');
    const { spawner, calls } = fakeSpawner(s.workDir, xml);
    await expect(unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner })).rejects.toBeInstanceOf(
      NotAs3Error,
    );
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['bad signature', 'XYZ\x09rest', true],
    ['missing path', '', false],
  ])('2.7 %s: InvalidSwfError and no process started', async (_name, bytes, createFile) => {
    const s = await setup({ swfBytes: bytes });
    const swf = createFile ? s.swf : join(s.workDir, 'nope.swf');
    const { spawner, calls } = fakeSpawner(s.workDir, fixtureHead);
    const err = await unpack({ swfPath: swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidSwfError);
    expect(err.message).toContain('not a valid SWF');
    expect(err.message).toContain(swf);
    expect(calls).toHaveLength(0);
  });

  describe('optional symbolClass/symbols.csv (Requirement 4)', () => {
    const withTag = () => fixtureHead.replace('</tags>', '<item type="SymbolClassTag" forceWriteAsLong="true"/>\n  </tags>');

    it('4.1 no tag and no csv succeeds with symbolClassPath null', async () => {
      const s = await setup();
      const { spawner } = fakeSpawner(s.workDir, fixtureHead, ['shapes', 'scripts']);
      const r = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner });
      expect(r.symbolClassPath).toBeNull();
    });

    it('4.2 tag and no csv fails with the missing-export error', async () => {
      const s = await setup();
      const { spawner } = fakeSpawner(s.workDir, withTag(), ['shapes', 'scripts']);
      const err = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e) => e);
      expect(err).toBeInstanceOf(MissingExportError);
      expect(err.names).toEqual(['symbolClass/symbols.csv']);
    });

    it('4.3 another missing export still fails when no tag is present', async () => {
      const s = await setup();
      const { spawner } = fakeSpawner(s.workDir, fixtureHead, ['shapes']);
      const err = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e) => e);
      expect(err).toBeInstanceOf(MissingExportError);
      expect(err.names).toEqual(['scripts']);
    });

    it('4.3 non-zero exit still fails', async () => {
      const s = await setup();
      const spawner: FfdecSpawner = async (req) => {
        if (req.args[0] === '-swf2xml') {
          await writeFile(req.args[2]!, fixtureHead);
          return { stdout: '', stderr: '' };
        }
        throw new FfdecExitError(1, 'bad');
      };
      await expect(unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner })).rejects.toBeInstanceOf(
        FfdecExitError,
      );
    });
  });

  describe('hasSymbolClassTag', () => {
    it('is true when an item has type SymbolClassTag', () => {
      expect(hasSymbolClassTag('<tags><item type="SymbolClassTag" forceWriteAsLong="true"></item></tags>')).toBe(true);
    });
    it('is false when absent', () => {
      expect(hasSymbolClassTag('<tags><item type="ShowFrameTag"/></tags>')).toBe(false);
    });
    it('is false when the name only appears inside a string', () => {
      expect(hasSymbolClassTag('<item type="DoABC2Tag" name="type=&quot;SymbolClassTag&quot;"/>')).toBe(false);
      expect(hasSymbolClassTag('<!-- <item type="SymbolClassTag"> -->'.replace('<item', '<x'))).toBe(false);
    });
  });

  it('2.8 missing exports are listed by name', async () => {
    const s = await setup();
    const { spawner } = fakeSpawner(
      s.workDir,
      fixtureHead.replace('</tags>', '<item type="SymbolClassTag"/>\n  </tags>'),
      ['shapes'],
    );
    const err = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e) => e);
    expect(err).toBeInstanceOf(MissingExportError);
    expect(err.names).toEqual(['symbolClass/symbols.csv', 'scripts']);
    expect(err.message).toContain('scripts');
    expect(err.message).toContain('symbolClass/symbols.csv');
  });

  it('2.9 unsupported XML major reports found and supported versions', async () => {
    const s = await setup();
    const xml = fixtureHead.replace('_xmlExportMajor="4"', '_xmlExportMajor="5"');
    const { spawner, calls } = fakeSpawner(s.workDir, xml);
    const err = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e) => e);
    expect(err).toBeInstanceOf(XmlVersionError);
    expect(err.message).toContain('5.2');
    expect(err.message).toContain('4');
    expect(calls).toHaveLength(1);
  });

  it('2.10 missing header values are listed by name', async () => {
    const s = await setup();
    const xml = fixtureHead.replace(/ frameRate="[^"]*"/, '').replace(/<displayRect[^>]*\/>/, '');
    const { spawner } = fakeSpawner(s.workDir, xml);
    const err = await unpack({ swfPath: s.swf, workDir: s.workDir, ffdecJarPath: s.jar, spawner }).catch((e) => e);
    expect(err).toBeInstanceOf(MissingHeaderValueError);
    expect(err.names).toEqual(['frameRate', 'stageRect']);
    expect(err.message).toContain('frameRate');
    expect(err.message).toContain('stageRect');
  });
});
