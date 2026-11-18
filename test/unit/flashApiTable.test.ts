import { describe, expect, it } from 'vitest';
import { FLASH_API_TABLE, entryOf, policyOf } from '../../src/translate/flashApiTable';

const STUB = [
  'flash.media.Sound', 'flash.media.SoundChannel', 'flash.media.SoundTransform', 'flash.media.SoundMixer',
  'flash.net.URLRequest', 'flash.net.navigateToURL', 'flash.net.URLLoader', 'flash.net.URLVariables',
  'flash.net.LocalConnection', 'flash.system.Security', 'flash.external.ExternalInterface',
  'flash.display.Loader', 'flash.net.SharedObject',
];
const GAP = [
  'flash.utils.ByteArray', 'flash.display.BitmapData', 'flash.display.Bitmap', 'XML', 'XMLList',
  'flash.geom.Matrix', 'flash.geom.ColorTransform', 'flash.system.ApplicationDomain',
  'flash.utils.getDefinitionByName', 'flash.system.Capabilities', 'flash.net.NetConnection',
  'flash.net.NetStream', 'flash.media.Video', 'flash.net.Socket', 'flash.net.XMLSocket',
  'flash.net.FileReference', 'flash.media.Camera', 'flash.media.Microphone', 'flash.display3D.Context3D',
];
const CAN_STALL = ['flash.media.Sound', 'flash.media.SoundChannel', 'flash.net.URLLoader', 'flash.display.Loader', 'flash.net.LocalConnection'];

describe('Flash_API_Table', () => {
  it('gives each listed class its policy and a reason', () => {
    for (const q of STUB) expect(policyOf(q), q).toBe('stub');
    for (const q of GAP) expect(policyOf(q), q).toBe('gap');
    expect(policyOf('flash.geom.Point')).toBe('real');
    for (const q of [...STUB, ...GAP, 'flash.geom.Point']) expect(entryOf(q)?.reason.length, q).toBeGreaterThan(0);
  });

  it('has no entry beyond the listed ones except LoaderInfo, and no duplicates', () => {
    const names = FLASH_API_TABLE.map((e) => e.qualified);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => ![...STUB, ...GAP, 'flash.geom.Point'].includes(n))).toEqual(['flash.display.LoaderInfo']);
  });

  it('answers absent for an unknown class, with or without a member', () => {
    expect(policyOf('com.example.Nothing')).toBe('absent');
    expect(policyOf('com.example.Nothing', 'play')).toBe('absent');
  });

  it('answers absent for a member that a stub entry does not list, and stub for one it lists', () => {
    expect(policyOf('flash.media.Sound', 'play')).toBe('stub');
    expect(policyOf('flash.media.Sound', 'extract')).toBe('absent');
    expect(policyOf('flash.net.SharedObject', 'getLocal')).toBe('stub');
    expect(policyOf('flash.net.SharedObject', 'nope')).toBe('absent');
  });

  it('keeps the policy of gap and real classes for any member', () => {
    expect(policyOf('flash.geom.Matrix', 'identity')).toBe('gap');
    expect(policyOf('flash.geom.Point', 'distance')).toBe('real');
  });

  it('marks every No_Event class canStall, and no other class', () => {
    for (const q of CAN_STALL) expect(entryOf(q)?.canStall, q).toBe(true);
    const others = FLASH_API_TABLE.filter((e) => !CAN_STALL.includes(e.qualified));
    for (const e of others) expect(e.canStall, e.qualified).toBeUndefined();
  });

  it('gives every stub entry members, and gap and real entries none', () => {
    for (const e of FLASH_API_TABLE) {
      if (e.policy === 'stub') expect(e.members?.length, e.qualified).toBeGreaterThan(0);
      else expect(e.members, e.qualified).toBeUndefined();
    }
  });

  it('points every stubObject neutral at a stub class (or the built-in Object)', () => {
    const shortNames = new Set(FLASH_API_TABLE.filter((e) => e.policy === 'stub').map((e) => e.qualified.split('.').pop()));
    for (const e of FLASH_API_TABLE) {
      for (const m of e.members ?? []) {
        if (typeof m.neutral === 'object' && m.neutral !== null && 'stubObject' in m.neutral) {
          const target = m.neutral.stubObject;
          expect(target === 'Object' || shortNames.has(target), `${e.qualified}.${m.name} -> ${target}`).toBe(true);
        }
      }
    }
  });

  it('names no game or sample', () => {
    const text = JSON.stringify(FLASH_API_TABLE).toLowerCase();
    for (const s of ['spacer', 'entity_game', 'clickgoto', 'joystick', 'slider', 'tweendemo']) expect(text.includes(s), s).toBe(false);
  });
});
