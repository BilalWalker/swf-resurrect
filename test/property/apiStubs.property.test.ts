// Properties 19 and 20 of the robustness design (task 14.3).
// "Records once" is per run: namedLimit keeps one entry per id until takeNamedLimits clears it, so each
// case clears the sink first and reads it after all calls.
import { existsSync, readdirSync } from 'node:fs';
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { FLASH_API_TABLE, entryOf, policyOf, stubClasses, type MemberSig } from '../../src/translate/flashApiTable';
import { renderAllStubs } from '../../src/translate/renderApiStubs';
import { SHIM_MEMBER_TABLE } from '../../src/translate/shimMembers.generated';
import { takeNamedLimits } from '../../template/shim/errorSink';
import * as shim from '../../template/shim/index';
import { fcConfig } from './config';

const simple = (q: string): string => q.slice(q.lastIndexOf('.') + 1);
const shimExports = shim as unknown as Record<string, any>;
const stubEntries = FLASH_API_TABLE.filter((e) => e.policy === 'stub');
const shipped = new Set(readdirSync('template/shim/stubs').filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3)));

beforeEach(() => {
  takeNamedLimits();
});

describe('Property 19: Table lookup and stub generation', () => {
  /** **Validates: Requirements 17.1, 17.5, 17.6** */
  it('policyOf is total and answers stub, real, gap or absent for any class and member', () => {
    const classes = fc.oneof(
      fc.constantFrom(...FLASH_API_TABLE.map((e) => e.qualified)),
      fc.string({ maxLength: 12 }),
      fc.constantFrom('flash.media.Sound ', 'flash.media', 'Sound', ''),
    );
    const members = fc.option(
      fc.oneof(fc.constantFrom(...stubEntries.flatMap((e) => (e.members ?? []).map((m) => m.name))), fc.string({ maxLength: 8 })),
      { nil: undefined },
    );
    fc.assert(
      fc.property(classes, members, (q, m) => {
        const p = policyOf(q, m);
        expect(['stub', 'real', 'gap', 'absent']).toContain(p);
        const e = entryOf(q);
        if (e === undefined) expect(p).toBe('absent');
        else if (e.policy !== 'stub' || m === undefined) expect(p).toBe(e.policy);
        else expect(p).toBe(e.members?.some((x) => x.name === m) === true ? 'stub' : 'absent');
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 17.2, 17.5** */
  it('a stub class is generated if and only if its policy is stub', () => {
    const generated = new Set(renderAllStubs().map((s) => s.name));
    expect(shipped).toEqual(generated);
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...FLASH_API_TABLE.map((e) => e.qualified)), fc.string({ maxLength: 10 })), (q) => {
        const isStub = policyOf(q) === 'stub';
        expect(generated.has(simple(q)) && stubClasses().includes(q)).toBe(isStub);
        if (!isStub) {
          // No gap, real or absent pair produces a stub: no generated class is named after it, unless a
          // stub class of the same simple name is a different table entry.
          const sameName = stubEntries.some((e) => simple(e.qualified) === simple(q));
          if (!sameName) expect(generated.has(simple(q))).toBe(false);
        }
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 17.2, 17.6** */
  it('every member of every stub entry exists in the Shim_Member_Table, or as a static of the Shim class', () => {
    fc.assert(
      fc.property(fc.constantFrom(...stubEntries), (e) => {
        const name = simple(e.qualified);
        const row = SHIM_MEMBER_TABLE[name];
        for (const m of e.members ?? []) {
          if (m.kind === 'constructor') continue;
          if (name === 'navigateToURL') {
            expect(typeof shimExports[name]).toBe('function');
          } else if (m.static) {
            expect(m.name in shimExports[name], `${name}.${m.name}`).toBe(true);
          } else {
            expect(row?.members.some((x) => x.name === m.name), `${name}.${m.name}`).toBe(true);
          }
        }
      }),
      fcConfig,
    );
  });
});

// ---- Property 20 ----

const dummy = (type: string): unknown => {
  switch (type) {
    case 'Number': case 'int': case 'uint': return 0;
    case 'String': return 'a';
    case 'Boolean': return false;
    default: return null;
  }
};

function argsOf(m: MemberSig): unknown[] {
  return m.params.filter((p) => !p[0].startsWith('...')).map((p) => dummy(p[1]));
}

function build(name: string): any {
  return new shimExports[name]();
}

/** One call of a non-constructor, non-field member; returns what it returned. */
function call(name: string, m: MemberSig, owner: any): unknown {
  const target = m.static ? shimExports[name] : owner;
  if (name === 'navigateToURL') return shimExports.navigateToURL(...argsOf(m));
  switch (m.kind) {
    case 'method': return target[m.name](...argsOf(m));
    case 'getter': return target[m.name];
    case 'setter': target[m.name] = dummy(m.params[0]![1]); return undefined;
    default: throw new Error(`call: ${m.kind}`);
  }
}

const callable = stubEntries.flatMap((e) =>
  (e.members ?? []).filter((m) => m.kind === 'method' || m.kind === 'getter' || m.kind === 'setter').map((m) => ({ e, m })),
);

describe('Property 20: A stub records once, returns a typed value, and flags the stalls', () => {
  /** **Validates: Requirements 17.3, 17.4, 17.7** */
  it('n calls of any stub member record one api-stub entry, return the neutral value and never throw', () => {
    fc.assert(
      fc.property(fc.constantFrom(...callable), fc.integer({ min: 1, max: 20 }), ({ e, m }, n) => {
        const name = simple(e.qualified);
        const owner = m.static || name === 'navigateToURL' ? undefined : build(name);
        takeNamedLimits();
        const results: unknown[] = [];
        expect(() => {
          for (let i = 0; i < n; i++) results.push(call(name, m, owner));
        }).not.toThrow();
        const id = name === 'navigateToURL' ? 'navigateToURL' : `${name}.${m.name}`;
        const got = takeNamedLimits().map((l) => l.id);
        expect(got.filter((i) => i === `api-stub:${id}`)).toHaveLength(1);
        expect(got.filter((i) => i.startsWith('api-stub:') && i !== `api-stub:${id}`)).toEqual([]);
        if (m.kind === 'setter') return;
        const nt = m.neutral;
        for (const r of results) {
          if (typeof nt === 'object' && nt !== null && 'stubObject' in nt) {
            expect(r).not.toBeNull();
            expect(r).not.toBeUndefined();
            expect(typeof r).toBe('object');
            if (nt.stubObject !== 'Object') expect(r).toBeInstanceOf(shimExports[nt.stubObject]);
            expect(r).toBe(results[0]);
          } else if (m.returns !== 'void') {
            expect(r).toEqual(nt);
          }
        }
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 17.4** */
  it('a returned stub object has its own members callable', () => {
    fc.assert(
      fc.property(fc.constantFrom(...callable.filter(({ m }) => typeof m.neutral === 'object' && m.neutral !== null && 'stubObject' in m.neutral)), ({ e, m }) => {
        const name = simple(e.qualified);
        const owner = m.static ? undefined : build(name);
        const obj = call(name, m, owner) as object;
        const target = (m.neutral as { stubObject: string }).stubObject;
        const inner = stubEntries.find((x) => simple(x.qualified) === target);
        for (const im of inner?.members ?? []) {
          if ((im.kind === 'method' || im.kind === 'getter') && !im.static) {
            expect(() => call(target, im, obj)).not.toThrow();
          }
        }
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 17.3, 17.7** */
  it('n constructions record one api-stub:<Class>.constructor entry', () => {
    const withCtor = stubEntries.filter((e) => e.members?.some((m) => m.kind === 'constructor') && simple(e.qualified) !== 'navigateToURL');
    fc.assert(
      fc.property(fc.constantFrom(...withCtor), fc.integer({ min: 1, max: 20 }), (e, n) => {
        const name = simple(e.qualified);
        takeNamedLimits();
        for (let i = 0; i < n; i++) build(name);
        const got = takeNamedLimits().map((l) => l.id);
        expect(got.filter((i) => i === `api-stub:${name}.constructor`)).toHaveLength(1);
      }),
      fcConfig,
    );
  });

  /** **Validates: Requirements 17.7, 17.11** */
  it('a canStall class records exactly one api-stub-no-event entry after first use, any other class none, and no event fires', () => {
    const types = ['complete', 'ioError', 'progress', 'soundComplete', 'open', 'init', 'status', 'securityError', 'httpStatus'];
    const instanceEntries = stubEntries.filter((e) => e.members?.some((m) => m.kind === 'constructor') && simple(e.qualified) !== 'navigateToURL');
    fc.assert(
      fc.property(fc.constantFrom(...instanceEntries), fc.integer({ min: 1, max: 10 }), (e, n) => {
        const name = simple(e.qualified);
        takeNamedLimits();
        let fired = 0;
        const objs: any[] = [];
        for (let i = 0; i < n; i++) {
          const o = build(name);
          objs.push(o);
          if (typeof o.addEventListener === 'function') for (const t of types) o.addEventListener(t, () => fired++);
        }
        for (const o of objs) {
          for (const m of e.members ?? []) {
            if (m.kind === 'method' || m.kind === 'getter') call(name, { ...m, static: false }, o);
          }
        }
        const got = takeNamedLimits().map((l) => l.id);
        const flags = got.filter((i) => i.startsWith('api-stub-no-event:'));
        expect(flags).toEqual(e.canStall === true ? [`api-stub-no-event:${name}`] : []);
        expect(fired).toBe(0);
      }),
      fcConfig,
    );
  });

  it('every stub class in the table has a shipped file and a Shim export (guard for the generators above)', () => {
    for (const e of stubEntries) {
      const name = simple(e.qualified);
      expect(existsSync(`template/shim/stubs/${name}.ts`), name).toBe(true);
      expect(name in shimExports, name).toBe(true);
    }
  });
});
