import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanAbcNames } from "../../src/facts/abcNames";
import { isObfuscated } from "../../src/recover/detect";
import { readFacts } from "../../src/facts/readFacts";
import {
  MN, TAG, abcTag, buildBody, buildConstantPool, buildSwf, nodeInflate,
  type PoolSpec,
} from "../support/hostileSwf";

const limits = { maxSizeBytes: 64 * 1024 * 1024 };

/** Builds a file with the given ABC tags and runs the scan as the pipeline does: readFacts, then scanAbcNames. */
function scanTags(tags: number[][]) {
  const r = readFacts(buildSwf({ version: 10, tags }), limits, nodeInflate);
  if (!r.ok) throw new Error(`readFacts failed: ${r.reasonCode}`);
  return scanAbcNames(r.body, r.abcRanges);
}

const scanPool = (spec: PoolSpec, code: 72 | 82 = 82) => scanTags([abcTag(code, buildConstantPool(spec))]);

describe("scanAbcNames", () => {
  it("counts valid and invalid multiname names for each kind that carries a name", () => {
    for (const kind of [MN.QName, MN.QNameA, MN.RTQName, MN.RTQNameA, MN.Multiname, MN.MultinameA]) {
      const s = scanPool({ multinames: [{ kind, name: "Player" }, { kind, name: "a b" }, { kind, name: "$x_1" }, { kind, name: "1x" }] });
      expect(s, `kind ${kind}`).toMatchObject({ namesScanned: 4, invalidNames: 2, complete: true });
    }
  });

  it("reads kinds without a name and skips them (RTQNameL, MultinameL, TypeName)", () => {
    const s = scanPool({
      namespaces: ["flash.display"],
      multinames: [
        { kind: MN.RTQNameL }, { kind: MN.RTQNameLA }, { kind: MN.MultinameL }, { kind: MN.MultinameLA },
        { kind: MN.TypeName, typeArgs: 3 }, { kind: MN.QName, name: "Sprite" }, { kind: MN.RTQNameL }, { kind: MN.QName, name: "x.y" },
      ],
    });
    expect(s).toMatchObject({ namesScanned: 2, invalidNames: 1, complete: true });
  });

  it("does not count literal strings, dotted namespace names or empty names", () => {
    const s = scanPool({
      ints: 3, uints: 2, doubles: 2,
      literals: ["hello world", "a.b.c", "!!"],
      namespaces: ["flash.display", "com.example.game"],
      multinames: [{ kind: MN.QName, name: "Main" }, { kind: MN.QName, name: "" }, { kind: MN.QName }],
    });
    expect(s).toMatchObject({ namesScanned: 1, invalidNames: 0, complete: true });
  });

  it("reads a tag 72 payload (whole payload) and a tag 82 payload (flags and name skipped) alike", () => {
    const spec: PoolSpec = { multinames: [{ kind: MN.QName, name: "ok" }, { kind: MN.QName, name: "bad name" }] };
    expect(scanPool(spec, 72)).toEqual(scanPool(spec, 82));
    expect(scanPool(spec, 72)).toMatchObject({ namesScanned: 2, invalidNames: 1 });
  });

  it("adds up the names of several ABC tags", () => {
    const one: PoolSpec = { multinames: [{ kind: MN.QName, name: "a" }, { kind: MN.QName, name: "b-c" }] };
    const s = scanTags([abcTag(72, buildConstantPool(one)), abcTag(82, buildConstantPool(one), "second")]);
    expect(s).toMatchObject({ namesScanned: 4, invalidNames: 2, complete: true });
  });

  it("accepts Unicode letters in names", () => {
    const s = scanPool({ multinames: [{ kind: MN.QName, name: "Größe" }, { kind: MN.QName, name: "名前" }] });
    expect(s).toMatchObject({ namesScanned: 2, invalidNames: 0 });
  });

  it("an unknown multiname kind keeps the names read so far and is not complete", () => {
    const s = scanPool({
      multinames: [...Array.from({ length: 10 }, (_, i) => ({ kind: MN.QName as number, name: `\u0002${i}` })), { kind: 0x55 }],
    });
    expect(s).toMatchObject({ complete: false, namesScanned: 10, invalidNames: 10 });
  });

  it("a truncated pool never throws and is not obfuscated", () => {
    const abc = buildConstantPool({
      literals: ["x"], namespaces: ["a.b"],
      multinames: Array.from({ length: 12 }, (_, i) => ({ kind: MN.QName as number, name: `\u0003${i}` })),
    });
    for (let n = 0; n <= abc.length; n++) {
      const s = scanTags([abcTag(82, abc.slice(0, n))]);
      expect(isObfuscated(s), `cut at ${n}`).toBe(n === abc.length);
      if (n < abc.length) expect(s.complete).toBe(false);
    }
  });

  it("a count larger than the bytes left reads as past the end", () => {
    const s = scanTags([abcTag(72, [0, 0, 46, 0, 0xff, 0xff, 0xff, 0xff, 0x0f])]);
    expect(s).toMatchObject({ complete: false, namesScanned: 0 });
  });

  it("a DoABC2 tag with no terminator for its name is unreadable, not a throw", () => {
    const body = buildBody({ tags: [] });
    expect(scanAbcNames(new Uint8Array(body), [{ code: 82, start: 0, end: 3 }])).toMatchObject({ complete: false });
    expect(scanAbcNames(new Uint8Array(body), [{ code: 72, start: 5, end: 1000 }])).toMatchObject({ complete: false });
  });

  it("no ABC tag gives zero counts", () => {
    expect(scanTags([])).toEqual({ namesScanned: 0, invalidNames: 0, complete: false });
  });

  it("is deterministic and ignores bytes after the multiname table", () => {
    const spec: PoolSpec = { multinames: [{ kind: MN.QName, name: "a" }], trailer: [1, 2, 3, 4, 5] };
    expect(scanPool(spec)).toEqual(scanPool(spec));
    expect(scanPool(spec)).toMatchObject({ namesScanned: 1, complete: true });
  });
});

// Real counts of robustness finding F15, measured by the throw-away parser of the design.
const SAMPLE_COUNTS: Record<string, number> = {
  "3_joystick": 62, clickgoto: 97, click_block: 21, entity_game: 454, mask_reapply: 26, slider_component: 539, tweendemo: 97,
};

function scanFile(path: string) {
  const r = readFacts(new Uint8Array(readFileSync(path)), limits, nodeInflate);
  if (!r.ok) throw new Error(`readFacts failed: ${r.reasonCode}`);
  return scanAbcNames(r.body, r.abcRanges);
}

describe("scanAbcNames on committed samples (F15)", () => {
  for (const [name, total] of Object.entries(SAMPLE_COUNTS)) {
    it(`${name}: ${total} names, 0 invalid, not obfuscated`, () => {
      const s = scanFile(`samples/${name}/test.swf`);
      expect(s).toEqual({ namesScanned: total, invalidNames: 0, complete: true });
      expect(isObfuscated(s)).toBe(false);
    });
  }
});

// The default suite never reads .work/judge-test/ (Checkpoint 1 decision); same switch as test/e2e/localFiles.e2e.test.ts.
const LOCAL = process.env.SWF_RESURRECT_LOCAL_FILES === "1";
const REDBALL = ".work/judge-test/redball4.swf";

describe("scanAbcNames on the local obfuscated file (F15, numbers only)", () => {
  it.skipIf(!LOCAL || !existsSync(REDBALL))("redball4: 1 537 of 2 919 names invalid, obfuscated", () => {
    expect(scanFile(REDBALL)).toEqual({ namesScanned: 2919, invalidNames: 1537, complete: true });
  });
});
