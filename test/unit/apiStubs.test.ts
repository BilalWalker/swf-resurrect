import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { FLASH_API_TABLE, stubClasses } from '../../src/translate/flashApiTable';
import { renderAllStubs } from '../../src/translate/renderApiStubs';
import * as shim from '../../template/shim/index';
import {
  ExternalInterface, LocalConnection, Loader, LoaderInfo, Security, SharedObject, Sound, SoundChannel,
  SoundMixer, SoundTransform, URLLoader, URLRequest, URLVariables, navigateToURL,
} from '../../template/shim/index';
import { takeNamedLimits } from '../../template/shim/errorSink';

const ids = (): string[] => takeNamedLimits().map((l) => l.id);

beforeEach(() => {
  takeNamedLimits();
});

describe('generated stubs (task 14.2)', () => {
  it('are the committed files: the table renders exactly template/shim/stubs/', () => {
    for (const s of renderAllStubs()) {
      expect(readFileSync(`template/shim/stubs/${s.file}`, 'utf8'), s.file).toBe(s.text);
    }
    expect(renderAllStubs().map((s) => s.name).sort()).toEqual(stubClasses().map((q) => q.split('.').pop()!).sort());
  });

  it('are all exported from the Shim index', () => {
    for (const q of stubClasses()) expect(q.split('.').pop()! in shim, q).toBe(true);
  });

  it('record one Named_Limit the first time a member is used, and return the neutral value each time', () => {
    const s = new Sound();
    takeNamedLimits();
    expect(s.length).toBe(0);
    expect(s.length).toBe(0);
    expect(s.isBuffering).toBe(false);
    expect(s.url).toBeNull();
    const got = takeNamedLimits().map((l) => l.id);
    expect(got.filter((i) => i.startsWith('api-stub:'))).toEqual(['api-stub:Sound.length', 'api-stub:Sound.isBuffering', 'api-stub:Sound.url']);
  });

  it('record api-stub:<Class>.constructor', () => {
    new URLVariables();
    expect(ids()).toEqual(['api-stub:URLVariables.constructor']);
  });

  it('Sound.play() returns a non-null SoundChannel whose soundTransform is non-null, the same each time', () => {
    const s = new Sound();
    const ch = s.play();
    expect(ch).toBeInstanceOf(SoundChannel);
    expect(s.play()).toBe(ch);
    expect(ch.soundTransform).toBeInstanceOf(SoundTransform);
    expect(ch.soundTransform).toBe(ch.soundTransform);
    expect(ch.position).toBe(0);
    expect(s.length).toBe(0);
    // Two Sounds do not share a channel.
    expect(new Sound().play()).not.toBe(ch);
  });

  it('creating a stub object records no constructor limit of its own', () => {
    const s = new Sound();
    takeNamedLimits();
    s.play();
    expect(ids().filter((i) => i.startsWith('api-stub:'))).toEqual(['api-stub:Sound.play']);
  });

  it('Sound and SoundChannel record api-stub-no-event once, at first use, and dispatch no soundComplete', () => {
    const s = new Sound();
    let fired = 0;
    s.addEventListener('complete', () => fired++);
    s.addEventListener('soundComplete', () => fired++);
    s.play();
    s.play().stop();
    expect(fired).toBe(0);
    const got = takeNamedLimits();
    expect(got.filter((l) => l.id === 'api-stub-no-event:Sound')).toHaveLength(1);
    expect(got.filter((l) => l.id === 'api-stub-no-event:SoundChannel')).toHaveLength(1);
    expect(got.find((l) => l.id === 'api-stub-no-event:Sound')!.detail).toContain('no soundComplete event');
  });

  it('every canStall class records api-stub-no-event:<Class> and none else does', () => {
    const made: Record<string, () => unknown> = {
      Sound: () => new Sound(), SoundChannel: () => new SoundChannel(), URLLoader: () => new URLLoader(),
      Loader: () => new Loader(), LocalConnection: () => new LocalConnection(),
    };
    for (const e of FLASH_API_TABLE.filter((x) => x.policy === 'stub')) {
      const name = e.qualified.split('.').pop()!;
      takeNamedLimits();
      if (e.canStall === true) {
        made[name]!();
        expect(ids(), name).toContain(`api-stub-no-event:${name}`);
      }
    }
    new URLRequest('a');
    new SoundTransform();
    new SharedObject();
    expect(ids().filter((i) => i.startsWith('api-stub-no-event:'))).toEqual([]);
  });

  it('URLLoader and Loader dispatch no complete, ioError or progress; load has no effect', () => {
    const u = new URLLoader(new URLRequest('http://example.invalid/x'));
    const l = new Loader();
    const seen: string[] = [];
    for (const t of ['complete', 'ioError', 'progress']) {
      u.addEventListener(t, () => seen.push(t));
      l.contentLoaderInfo.addEventListener(t, () => seen.push(t));
    }
    u.load(new URLRequest('http://example.invalid/y'));
    l.load(new URLRequest('http://example.invalid/z'));
    expect(seen).toEqual([]);
    expect(u.data).toBeNull();
    expect(l.content).toBeNull();
    expect(l.contentLoaderInfo).toBeInstanceOf(LoaderInfo);
    expect(l.contentLoaderInfo).toBe(l.contentLoaderInfo);
    expect(ids()).toContain('api-stub-no-event:URLLoader');
  });

  it('a field stores what the game assigns, starting at its neutral value; reading records nothing', () => {
    const r = new URLRequest('http://example.invalid/a');
    takeNamedLimits();
    expect(r.url).toBe('http://example.invalid/a');
    expect(r.method).toBe('GET');
    r.method = 'POST';
    r.data = { a: 1 };
    expect(r.method).toBe('POST');
    expect(r.data).toEqual({ a: 1 });
    expect(takeNamedLimits()).toEqual([]);
    expect(new URLRequest().url).toBe('');
  });

  it('SharedObject.getLocal returns the same non-null object per name, with an in-memory data object, and no storage', () => {
    const a = SharedObject.getLocal('save');
    expect(a).toBeInstanceOf(SharedObject);
    expect(SharedObject.getLocal('save')).toBe(a);
    expect(SharedObject.getLocal('other')).not.toBe(a);
    a.data.score = 7;
    expect(SharedObject.getLocal('save').data.score).toBe(7);
    expect(a.data).toBe(a.data);
    expect(a.flush()).toBe('');
    expect(typeof (globalThis as { localStorage?: unknown }).localStorage).toBe('undefined');
    expect(ids()).toContain('api-stub:SharedObject.getLocal');
  });

  it('ExternalInterface.available is false and call returns null; navigateToURL, Security and SoundMixer do nothing', () => {
    expect(ExternalInterface.available).toBe(false);
    expect(ExternalInterface.call('f', 1, 2)).toBeNull();
    ExternalInterface.addCallback('f', () => 1);
    navigateToURL(new URLRequest('http://example.invalid/'), '_blank');
    Security.allowDomain('*');
    Security.loadPolicyFile('http://example.invalid/crossdomain.xml');
    SoundMixer.stopAll();
    expect(SoundMixer.soundTransform).toBeInstanceOf(SoundTransform);
    const got = ids();
    expect(got).toContain('api-stub:ExternalInterface.available');
    expect(got).toContain('api-stub:navigateToURL');
    expect(got).toContain('api-stub:Security.allowDomain');
  });

  it('LocalConnection never delivers a message and never throws', () => {
    const c = new LocalConnection();
    expect(() => {
      c.connect('x');
      c.send('x', 'm', 1);
      c.close();
    }).not.toThrow();
    expect(c.domain).toBe('');
  });

  it('SoundTransform starts at volume 1 and pan 0 (AS3 documentation default, not measured) and stores its arguments', () => {
    const d = new SoundTransform();
    expect([d.volume, d.pan]).toEqual([1, 0]);
    const t = new SoundTransform(0.25, -1);
    expect([t.volume, t.pan]).toEqual([0.25, -1]);
    expect(new SoundTransform(0).volume).toBe(0);
  });
});