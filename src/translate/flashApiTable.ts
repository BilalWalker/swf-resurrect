/**
 * Flash_API_Table (robustness design, "Flash_API_Table and stubs"): one entry per Flash class that
 * the Shim does not implement, with a policy.
 *
 * Core file: no node:*, no clock, no randomness. The generator (scripts/gen-api-stubs.ts, task 14.2)
 * reads this table; nothing else decides which stubs exist.
 *
 * Evidence label for every neutral value and event rule below: chosen by us (from the design table,
 * Requirement 17). None was read in Ruffle or measured against Flash. A neutral value is what a silent
 * page sees, not what Flash returns.
 */

/** A primitive neutral value, an empty array, or an object that Flash returns (a stub of that class). */
export type Neutral = number | string | boolean | null | readonly [] | { readonly stubObject: string };

export type MemberKind = 'method' | 'getter' | 'setter' | 'field' | 'constructor';

/** `[name, type, default?]`; a default is the AS3 source text of the default value. */
export type ParamSig = readonly [name: string, type: string, defaultValue?: string];

export interface MemberSig {
  readonly name: string;
  readonly kind: MemberKind;
  readonly static: boolean;
  readonly params: readonly ParamSig[];
  readonly returns: string;
  readonly neutral: Neutral;
  /** Constructor only: [parameter, field] pairs; the constructor stores each argument into the field. */
  readonly stores?: readonly (readonly [param: string, field: string])[];
}

export type ApiPolicy = 'stub' | 'real' | 'gap';

export interface FlashApiEntry {
  readonly qualified: string;
  readonly policy: ApiPolicy;
  readonly reason: string;
  /** No_Event_Stub: the stub dispatches no completion event, so a game that waits for one stays waiting. */
  readonly canStall?: boolean;
  /** Shim base class of the generated stub (task 14.2): `EventDispatcher` so addEventListener type-checks; nothing is dispatched. */
  readonly extends?: string;
  readonly members?: readonly MemberSig[];
}

export type PolicyResult = ApiPolicy | 'absent';

type Opts = { static?: boolean; params?: readonly ParamSig[] };
const method = (name: string, returns: string, neutral: Neutral, o: Opts = {}): MemberSig => ({
  name, kind: 'method', static: o.static ?? false, params: o.params ?? [], returns, neutral,
});
const getter = (name: string, returns: string, neutral: Neutral, o: Opts = {}): MemberSig => ({
  name, kind: 'getter', static: o.static ?? false, params: [], returns, neutral,
});
const setter = (name: string, type: string, o: Opts = {}): MemberSig => ({
  name, kind: 'setter', static: o.static ?? false, params: [['value', type]], returns: 'void', neutral: null,
});
const field = (name: string, type: string, neutral: Neutral, o: Opts = {}): MemberSig => ({
  name, kind: 'field', static: o.static ?? false, params: [], returns: type, neutral,
});
const ctor = (params: readonly ParamSig[] = [], stores?: readonly (readonly [string, string])[]): MemberSig => ({
  name: 'constructor', kind: 'constructor', static: false, params, returns: 'void', neutral: null,
  ...(stores !== undefined ? { stores } : {}),
});
const stubObject = (cls: string): Neutral => ({ stubObject: cls });
/** A getter and its setter, for a property that Flash lets a game assign. */
const prop = (name: string, type: string, neutral: Neutral, o: Opts = {}): MemberSig[] => [
  getter(name, type, neutral, o), setter(name, type, o),
];

const NO_EFFECT = 'the effect leaves the page and no return value feeds a computation';

export const FLASH_API_TABLE: readonly FlashApiEntry[] = [
  // ---- stub ----
  {
    qualified: 'flash.media.Sound', policy: 'stub', canStall: true, extends: 'EventDispatcher',
    reason: `silent: sound output leaves the page; play() returns a SoundChannel stub; soundComplete is never dispatched`,
    members: [
      ctor([['stream', 'URLRequest', 'null']]),
      method('play', 'SoundChannel', stubObject('SoundChannel'), {
        params: [['startTime', 'Number', '0'], ['loops', 'int', '0'], ['sndTransform', 'SoundTransform', 'null']],
      }),
      method('load', 'void', null, { params: [['stream', 'URLRequest']] }),
      method('close', 'void', null),
      getter('length', 'Number', 0),
      getter('bytesLoaded', 'uint', 0),
      getter('bytesTotal', 'int', 0),
      getter('isBuffering', 'Boolean', false),
      getter('url', 'String', null),
    ],
  },
  {
    qualified: 'flash.media.SoundChannel', policy: 'stub', canStall: true, extends: 'EventDispatcher',
    reason: `silent: holds a SoundTransform stub; position is 0; soundComplete is never dispatched`,
    members: [
      method('stop', 'void', null),
      getter('position', 'Number', 0),
      getter('leftPeak', 'Number', 0),
      getter('rightPeak', 'Number', 0),
      ...prop('soundTransform', 'SoundTransform', stubObject('SoundTransform')),
    ],
  },
  {
    qualified: 'flash.media.SoundTransform', policy: 'stub',
    reason: NO_EFFECT,
    members: [
      // AS3 documentation default (new SoundTransform(): volume 1, pan 0), not measured and not read in Ruffle.
      ctor([['vol', 'Number', '1'], ['panning', 'Number', '0']], [['vol', 'volume'], ['panning', 'pan']]),
      field('volume', 'Number', 1),
      field('pan', 'Number', 0),
      field('leftToLeft', 'Number', 0),
      field('leftToRight', 'Number', 0),
      field('rightToLeft', 'Number', 0),
      field('rightToRight', 'Number', 0),
    ],
  },
  {
    qualified: 'flash.media.SoundMixer', policy: 'stub',
    reason: NO_EFFECT,
    members: [
      method('stopAll', 'void', null, { static: true }),
      ...prop('soundTransform', 'SoundTransform', stubObject('SoundTransform'), { static: true }),
      field('bufferTime', 'int', 0, { static: true }),
    ],
  },
  {
    qualified: 'flash.net.URLRequest', policy: 'stub',
    reason: 'no network: the request object only carries its fields',
    members: [
      ctor([['url', 'String', 'null']]),
      field('url', 'String', ''),
      field('method', 'String', 'GET'),
      field('data', 'Object', null),
      field('contentType', 'String', ''),
    ],
  },
  {
    qualified: 'flash.net.navigateToURL', policy: 'stub',
    reason: 'no navigation: the call does nothing',
    members: [
      method('navigateToURL', 'void', null, { params: [['request', 'URLRequest'], ['window', 'String', 'null']] }),
    ],
  },
  {
    qualified: 'flash.net.URLLoader', policy: 'stub', canStall: true, extends: 'EventDispatcher',
    reason: 'no network: load does nothing, data is null; complete, ioError and progress are never dispatched',
    members: [
      ctor([['request', 'URLRequest', 'null']]),
      method('load', 'void', null, { params: [['request', 'URLRequest']] }),
      method('close', 'void', null),
      field('data', '*', null),
      field('dataFormat', 'String', 'text'),
      field('bytesLoaded', 'uint', 0),
      field('bytesTotal', 'uint', 0),
    ],
  },
  {
    qualified: 'flash.net.URLVariables', policy: 'stub',
    reason: 'no network: the object is a plain holder and parses nothing',
    members: [
      ctor([['source', 'String', 'null']]),
      method('decode', 'void', null, { params: [['source', 'String']] }),
      method('toString', 'String', ''),
    ],
  },
  {
    qualified: 'flash.net.LocalConnection', policy: 'stub', canStall: true, extends: 'EventDispatcher',
    reason: 'no connection: messages never arrive',
    members: [
      ctor(),
      method('connect', 'void', null, { params: [['connectionName', 'String']] }),
      method('send', 'void', null, { params: [['connectionName', 'String'], ['methodName', 'String'], ['...args', '*']] }),
      method('close', 'void', null),
      method('allowDomain', 'void', null, { params: [['...domains', '*']] }),
      getter('domain', 'String', ''),
      field('client', 'Object', null),
    ],
  },
  {
    qualified: 'flash.system.Security', policy: 'stub',
    reason: 'no security sandbox in the page: allowDomain and the policy-file calls do nothing',
    members: [
      method('allowDomain', 'void', null, { static: true, params: [['...domains', '*']] }),
      method('allowInsecureDomain', 'void', null, { static: true, params: [['...domains', '*']] }),
      method('loadPolicyFile', 'void', null, { static: true, params: [['url', 'String']] }),
    ],
  },
  {
    qualified: 'flash.external.ExternalInterface', policy: 'stub',
    reason: 'no host page calls: available is false and call returns null',
    members: [
      getter('available', 'Boolean', false, { static: true }),
      method('call', '*', null, { static: true, params: [['functionName', 'String'], ['...args', '*']] }),
      method('addCallback', 'void', null, { static: true, params: [['functionName', 'String'], ['closure', 'Function']] }),
    ],
  },
  {
    qualified: 'flash.display.Loader', policy: 'stub', canStall: true, extends: 'EventDispatcher',
    reason: 'no loading: load does nothing, content is null; contentLoaderInfo events never fire',
    members: [
      ctor(),
      method('load', 'void', null, { params: [['request', 'URLRequest'], ['context', '*', 'null']] }),
      method('close', 'void', null),
      method('unload', 'void', null),
      getter('content', 'DisplayObject', null),
      getter('contentLoaderInfo', 'LoaderInfo', stubObject('LoaderInfo')),
    ],
  },
  {
    // Not in the task's list: Loader.contentLoaderInfo is "a non-null stub object" (design table), so the
    // class it returns must itself be a stub class. Flagged in the task report.
    qualified: 'flash.display.LoaderInfo', policy: 'stub', extends: 'EventDispatcher',
    reason: 'returned by Loader.contentLoaderInfo; nothing loads, so its events never fire',
    members: [
      getter('bytesLoaded', 'uint', 0),
      getter('bytesTotal', 'uint', 0),
      getter('url', 'String', ''),
      getter('content', 'DisplayObject', null),
    ],
  },
  {
    qualified: 'flash.net.SharedObject', policy: 'stub', extends: 'EventDispatcher',
    reason: 'no browser storage: getLocal returns an object whose data lives in memory for the life of the page',
    members: [
      method('getLocal', 'SharedObject', stubObject('SharedObject'), {
        static: true, params: [['name', 'String'], ['localPath', 'String', 'null'], ['secure', 'Boolean', 'false']],
      }),
      // 'Object' is the built-in: a fresh empty object kept for the life of the page (task 14.2 decides how).
      getter('data', 'Object', stubObject('Object')),
      method('flush', 'String', '', { params: [['minDiskSpace', 'int', '0']] }),
      method('clear', 'void', null),
      method('close', 'void', null),
    ],
  },
  // ---- real ----
  {
    qualified: 'flash.geom.Point', policy: 'real',
    reason: 'small pure class with exact semantics; implemented as in Flash, not stubbed',
  },
  // ---- gap ----
  ...gaps([
    ['flash.utils.ByteArray', 'bytes feed computation; a neutral value would be silently wrong'],
    ['flash.display.BitmapData', 'pixel data feeds computation; out of scope (BitmapData manipulation)'],
    ['flash.display.Bitmap', 'data calls need BitmapData; out of scope (BitmapData manipulation)'],
    ['XML', 'E4X is out of scope; a parsed result cannot be neutral'],
    ['XMLList', 'E4X is out of scope; a parsed result cannot be neutral'],
    ['flash.geom.Matrix', 'geometry results feed computation; a neutral value would be silently wrong'],
    ['flash.geom.ColorTransform', 'colour results feed computation; a neutral value would be silently wrong'],
    ['flash.system.ApplicationDomain', 'reflection result feeds computation'],
    ['flash.utils.getDefinitionByName', 'reflection result feeds computation'],
    ['flash.system.Capabilities', 'a device value feeds computation; a neutral value would be silently wrong'],
    ['flash.net.NetConnection', 'networking and video are out of scope'],
    ['flash.net.NetStream', 'networking and video are out of scope'],
    ['flash.media.Video', 'video is out of scope'],
    ['flash.net.Socket', 'networking is out of scope'],
    ['flash.net.XMLSocket', 'networking is out of scope'],
    ['flash.net.FileReference', 'file access is a host call whose result feeds computation'],
    ['flash.media.Camera', 'a device value feeds computation'],
    ['flash.media.Microphone', 'a device value feeds computation'],
    ['flash.display3D.Context3D', 'Stage3D is out of scope'],
  ]),
];

function gaps(rows: readonly (readonly [string, string])[]): FlashApiEntry[] {
  return rows.map(([qualified, reason]) => ({ qualified, policy: 'gap', reason }));
}

const BY_QUALIFIED: ReadonlyMap<string, FlashApiEntry> = new Map(FLASH_API_TABLE.map((e) => [e.qualified, e]));

export function entryOf(qualified: string): FlashApiEntry | undefined {
  return BY_QUALIFIED.get(qualified);
}

/**
 * Total. An unknown class is `absent`. A class with policy `stub` answers for a member only when the entry
 * lists it (`stub`), otherwise `absent` (a visible gap, Requirement 17.5). `real` and `gap` classes answer
 * their own policy for any member.
 */
export function policyOf(qualified: string, member?: string): PolicyResult {
  const entry = BY_QUALIFIED.get(qualified);
  if (entry === undefined) return 'absent';
  if (member === undefined || entry.policy !== 'stub') return entry.policy;
  return entry.members?.some((m) => m.name === member) === true ? 'stub' : 'absent';
}

/** Qualified names of the `stub` entries: the set the generator writes and the stub-dependency scan reads. */
export function stubClasses(): readonly string[] {
  return FLASH_API_TABLE.filter((e) => e.policy === 'stub').map((e) => e.qualified);
}
