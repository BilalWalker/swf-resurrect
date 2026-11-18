// Repository hygiene (breadth sub-task 19.2). Validates: Requirements 15.4, 15.6, 15.8, 15.11, 15.13
// Reads `git ls-files` once. Failures print paths, never matched text.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hasGit = existsSync(".git");
// Skipped, with this reason, when there is no .git directory (not a checkout).

/**
 * devDependency names of package.json as it was before Task 1 of the breadth spec
 * (`git show e117e2d^:package.json`, e117e2d being the first task commit; the parent is 2ced44f).
 * A New_Dependency is not in this list and fails the test (Requirement 15.8).
 */
const BASELINE_DEPENDENCIES = [
  // Runs the original SWF in the web UI side-by-side view (web/client); pinned exact.
  "@ruffle-rs/ruffle",
  "@types/node",
  "fast-check",
  "fast-xml-parser",
  "pixi.js",
  "playwright",
  "pngjs",
  "tsx",
  "typescript",
  "typescript-js",
  "vite",
  "vitest",
];

const BINARY_EXT = /\.(swf|png|jpe?g|gif|webp|mp3|ogg|wav|zip|ico|woff2?|ttf|otf|bin)$/i;

const tracked: string[] = hasGit
  ? execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\0")
      .filter((p) => p !== "" && existsSync(p))
  : [];

describe.skipIf(!hasGit)("repository hygiene", () => {
  it("tracks nothing under tools/, out/, .work/ or dist/", () => {
    expect(tracked.filter((p) => /^(tools|out|\.work|dist)\//.test(p))).toEqual([]);
  });

  it("tracks no Reference_Frame, Rendered_Frame or Diff_Image PNG outside test/fixtures/", () => {
    const offenders = tracked.filter(
      (p) => !p.startsWith("test/fixtures/") && /(^|\/)[^/]*(reference|rendered|diff)[^/]*\.png$/i.test(p),
    );
    expect(offenders).toEqual([]);
  });

  it("pins every dependency to an exact version and adds no New_Dependency", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, Record<string, string> | undefined>;
    const unpinned: string[] = [];
    const unknown: string[] = [];
    for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, version] of Object.entries(pkg[section] ?? {})) {
        // "npm:typescript@6.0.3" is an exact alias; the version after the last "@" is what must be exact.
        const spec = version.startsWith("npm:") ? version.slice(version.lastIndexOf("@") + 1) : version;
        if (/[\^~*>]/.test(version) || !/^\d+\.\d+\.\d+$/.test(spec)) unpinned.push(`${section}:${name}`);
        if (!BASELINE_DEPENDENCIES.includes(name)) unknown.push(`${section}:${name}`);
      }
    }
    expect(unpinned).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it("contains no token-like string in a tracked text file", () => {
    // Needles and patterns are built by concatenation so that this file does not match itself.
    // Each file is read once; a plain substring check runs first so the regexes only see the rare
    // candidates. Generated dumps (fixture XML) and files over 1 MB are not hand-written source.
    const needles = ["gh" + "p_", "github" + "_pat_", "AK" + "IA", "-----" + "BEGIN "];
    const patterns = [
      new RegExp("gh" + "p_\\w{20,}"),
      new RegExp("github" + "_pat_\\w{20,}"),
      new RegExp("AK" + "IA[A-Z0-9]{16}"),
      new RegExp("^-----" + "BEGIN [A-Z ]*PRIVATE KEY", "m"),
      new RegExp("^-----" + "BEGIN PRIVATE KEY", "m"),
    ];
    const offenders: string[] = [];
    for (const p of tracked) {
      if (BINARY_EXT.test(p) || /^test\/fixtures\/.*\.xml$/.test(p) || p === "package-lock.json") continue;
      if (statSync(p).size > 1_000_000) continue; // not read at all
      const buf = readFileSync(p);
      if (buf.includes(0)) continue;
      // Buffer.includes scans the bytes natively; the text is decoded only for the rare candidate.
      if (!needles.some((n) => buf.includes(n, 0, "latin1"))) continue;
      const text = buf.toString("latin1");
      if (patterns.some((re) => re.test(text))) offenders.push(p);
    }
    expect(offenders).toEqual([]);
  });

  it("names every Core file of the purity test in at least one other test file", () => {
    const purity = readFileSync("test/unit/breadthCorePurity.test.ts", "utf8");
    const listed = /const CORE_FILES = \[([\s\S]*?)\];/.exec(purity)?.[1] ?? "";
    const core = [...listed.matchAll(/"([^"]+\.ts)"/g)].map((m) => m[1]!);
    // The files the purity test names; the verify/core directory scan there is not a name list.
    const files = core;
    expect(files.length).toBeGreaterThan(15);
    const self = "test/unit/repoHygiene.test.ts";
    const testTexts = tracked
      .filter((p) => p.startsWith("test/") && /\.ts$/.test(p) && p !== self && p !== "test/unit/breadthCorePurity.test.ts")
      .map((p) => readFileSync(p, "utf8"));
    const unnamed = files.filter((f) => {
      const base = f.replace(/^.*\//, "").replace(/\.ts$/, "");
      return !testTexts.some((t) => t.includes(f) || new RegExp(`/${base}["'.]`).test(t));
    });
    expect(unnamed).toEqual([]);
  });
});
