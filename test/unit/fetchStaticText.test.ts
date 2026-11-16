import { describe, expect, it } from "vitest";
import { type FetchDeps, fetchStaticText } from "../../scripts/fetch-static-text.js";
import { exitCodeFor, fetchSpacer } from "../../scripts/fetch-spacer.js";
import { SPACER_SOURCE, STATIC_TEXT_SOURCE, candidateUrl, sha256Hex } from "../../src/samples/fetchedSample.js";

const TARGET = STATIC_TEXT_SOURCE.targetPath;
const PART = `${TARGET}.part`;
const enc = new TextEncoder();

// A source whose expected hash matches the stub bytes, so no real file is needed.
async function sourceFor(bytes: Uint8Array) {
  return { ...STATIC_TEXT_SOURCE, sha256: await sha256Hex(bytes) };
}

function stubDeps(opts: { existing?: Uint8Array | null; download?: Uint8Array | Error }) {
  const calls: string[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const deps: FetchDeps = {
    async fetchBytes(url) {
      calls.push(`fetch ${url}`);
      if (opts.download instanceof Error) throw opts.download;
      return opts.download ?? new Uint8Array();
    },
    async readLocal() {
      throw new Error("not used");
    },
    async writeFile(path) {
      calls.push(`write ${path}`);
    },
    async rename(from, to) {
      calls.push(`rename ${from} ${to}`);
    },
    async removeFile(path) {
      calls.push(`remove ${path}`);
    },
    async readFileIfPresent() {
      return opts.existing ?? null;
    },
    async mkdirp(path) {
      calls.push(`mkdirp ${path}`);
    },
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  };
  return { deps, calls, out, err };
}

describe("fetchStaticText", () => {
  it("writes <target>.part and renames it when the SHA-256 matches", async () => {
    const bytes = enc.encode("swf bytes");
    const source = await sourceFor(bytes);
    const s = stubDeps({ download: bytes });
    expect(await fetchStaticText(s.deps, source)).toBe("fetched");
    expect(s.calls).toEqual([
      `fetch ${candidateUrl(source.repo, source.commit, source.repoPath)}`,
      "mkdirp .work/samples/static_text",
      `write ${PART}`,
      `rename ${PART} ${TARGET}`,
    ]);
  });

  it("returns already-present without network when the target matches", async () => {
    const bytes = enc.encode("swf bytes");
    const source = await sourceFor(bytes);
    const s = stubDeps({ existing: bytes });
    expect(await fetchStaticText(s.deps, source)).toBe("already-present");
    expect(s.calls).toEqual([]);
    expect(s.out.join("\n")).toContain("already present");
  });

  it("on a mismatch prints both values, writes nothing and removes .part", async () => {
    const source = await sourceFor(enc.encode("expected"));
    const wrong = enc.encode("something else");
    const s = stubDeps({ download: wrong });
    expect(await fetchStaticText(s.deps, source)).toBe("sha-mismatch");
    expect(s.calls.some((c) => c.startsWith("write ") || c.startsWith("rename "))).toBe(false);
    expect(s.calls).toContain(`remove ${PART}`);
    const text = s.err.join("\n");
    expect(text).toContain(source.sha256);
    expect(text).toContain(await sha256Hex(wrong));
  });

  it("returns download-failed and removes .part when the download throws", async () => {
    const source = await sourceFor(enc.encode("x"));
    const s = stubDeps({ download: new Error("HTTP 404 Not Found") });
    expect(await fetchStaticText(s.deps, source)).toBe("download-failed");
    expect(s.calls.some((c) => c.startsWith("write ") || c.startsWith("rename "))).toBe(false);
    expect(s.calls).toContain(`remove ${PART}`);
    expect(s.err.join("\n")).toContain("HTTP 404");
  });
});

// Spec task 2.1: the generalised core and the spacer script.
describe("fetchSample and fetch-spacer", () => {
  const enc = new TextEncoder();
  async function stub(opts: { local?: Uint8Array | Error; download?: Uint8Array | Error; existing?: Uint8Array | null }) {
    const calls: string[] = [];
    const out: string[] = [];
    const err: string[] = [];
    const deps: FetchDeps = {
      async fetchBytes(url) {
        calls.push(`fetch ${url}`);
        if (opts.download instanceof Error) throw opts.download;
        return opts.download ?? new Uint8Array();
      },
      async readLocal(path) {
        calls.push(`local ${path}`);
        if (opts.local === undefined || opts.local instanceof Error) throw new Error("ENOENT");
        return opts.local;
      },
      async writeFile(path) {
        calls.push(`write ${path}`);
      },
      async rename(from, to) {
        calls.push(`rename ${from} ${to}`);
      },
      async removeFile(path) {
        calls.push(`remove ${path}`);
      },
      async readFileIfPresent() {
        return opts.existing ?? null;
      },
      async mkdirp(path) {
        calls.push(`mkdirp ${path}`);
      },
      out: (l) => out.push(l),
      err: (l) => err.push(l),
    };
    return { deps, calls, out, err };
  }
  const writes = (calls: string[]) => calls.filter((c) => c.startsWith("write ") || c.startsWith("rename "));

  it("copies a local file after the hash check, writing once", async () => {
    const bytes = enc.encode("local swf");
    const source = { ...SPACER_SOURCE, sha256: await sha256Hex(bytes) };
    const s = await stub({ local: bytes });
    expect(await fetchSpacer(s.deps, "a/b.swf", source)).toBe("fetched");
    expect(s.calls).toEqual([
      "local a/b.swf",
      "mkdirp .work/samples/spacer",
      `write ${SPACER_SOURCE.targetPath}.part`,
      `rename ${SPACER_SOURCE.targetPath}.part ${SPACER_SOURCE.targetPath}`,
    ]);
  });

  it("a local file with another hash writes nothing and maps to exit 1", async () => {
    const s = await stub({ local: enc.encode("other") });
    const outcome = await fetchSpacer(s.deps, "a/b.swf");
    expect(outcome).toBe("sha-mismatch");
    expect(writes(s.calls)).toEqual([]);
    expect(exitCodeFor(outcome)).toBe(1);
  });

  it("an unreadable local path maps to exit 3 and writes nothing", async () => {
    const s = await stub({});
    const outcome = await fetchSpacer(s.deps, "missing.swf");
    expect(outcome).toBe("local-unreadable");
    expect(writes(s.calls)).toEqual([]);
    expect(exitCodeFor(outcome)).toBe(3);
  });

  it("downloads the release asset when no path is given", async () => {
    const bytes = enc.encode("downloaded");
    const source = { ...SPACER_SOURCE, sha256: await sha256Hex(bytes) };
    const s = await stub({ download: bytes });
    expect(await fetchSpacer(s.deps, undefined, source)).toBe("fetched");
    expect(s.calls[0]).toBe(`fetch ${SPACER_SOURCE.url}`);
    const failed = await stub({ download: new Error("HTTP 404") });
    expect(exitCodeFor(await fetchSpacer(failed.deps))).toBe(2);
  });

  it("without a path and without a download URL exits 2 with a message asking for the path", async () => {
    const { url: _url, ...noUrl } = SPACER_SOURCE;
    const s = await stub({});
    const outcome = await fetchSpacer(s.deps, undefined, noUrl);
    expect(outcome).toBe("path-required");
    expect(exitCodeFor(outcome)).toBe(2);
    expect(s.err.join("\n")).toContain("fetch:spacer --");
    expect(s.calls).toEqual([]);
  });
});
