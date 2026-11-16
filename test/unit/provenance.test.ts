import { readdirSync, readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isAllowedLicence,
  licencePointers,
  parseExpectedState,
  validateProvenance,
} from "../support/provenance";
import { classifySampleDir } from "../../src/samples/fetchedSample";
import { validateFetchedNoteRows } from "../support/fetchedSample";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir: string, accept: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, accept));
    else if (accept(name)) out.push(p);
  }
  return out;
}

const PTR_LINE = "Licence text: samples/LICENSES/MIT-Ruffle.txt";

const good = `| Field | Value |
|---|---|
| Author | A |
| Source URL | https://example.com/x |
| Licence | MIT |
| SHA-256 | \`${"ab".repeat(32)}\` |

${PTR_LINE}

## Embedded fonts

no embedded fonts

## Expected state

| Action | \`l_button\` | \`r_button\` |
|---|---|---|
| Start | stopped, frame 1 | stopped, frame 1 |
| Click | \`gotoAndPlay(2)\`: playing from 2 | stopped, frame 2 |
`;

describe("provenance parser (examples)", () => {
  it("accepts a valid note", () => {
    expect(validateProvenance(good, { clickSample: true })).toEqual([]);
  });

  it("names the missing field", () => {
    const text = good.replace("| Author | A |\n", "");
    expect(validateProvenance(text, { clickSample: false }).join()).toMatch(/author/);
  });

  it("rejects relative and non-http URLs", () => {
    for (const u of ["example.com/x", "ftp://example.com/x", "/a/b"]) {
      const p = validateProvenance(good.replace("https://example.com/x", u), { clickSample: false });
      expect(p.join()).toMatch(/source URL/);
    }
  });

  it("applies the licence allow-list and OR rule", () => {
    expect(isAllowedLicence("MIT OR Apache-2.0")).toBe(true);
    expect(isAllowedLicence("GPL-3.0 OR MIT")).toBe(true);
    expect(isAllowedLicence("GPL-3.0")).toBe(false);
    expect(isAllowedLicence("GPL-3.0 OR LGPL-2.1")).toBe(false);
    expect(isAllowedLicence("mit")).toBe(false);
  });

  it("rejects an Expected_State frame outside 1..total", () => {
    const text = good.replace("stopped, frame 2", "stopped, frame 3");
    expect(validateProvenance(text, { clickSample: true }).join()).toMatch(/Expected_State/);
    expect(() => parseExpectedState(text)).toThrow();
    expect(parseExpectedState(text, 3)).toHaveLength(2);
  });

  it("requires an Expected_State only for the Click_Sample", () => {
    const text = good.slice(0, good.indexOf("| Action"));
    expect(validateProvenance(text, { clickSample: false })).toEqual([]);
    expect(validateProvenance(text, { clickSample: true }).join()).toMatch(/Expected_State/);
  });
});

describe("licence pointers (examples)", () => {
  const noPtr = good.replace(PTR_LINE, "");
  const dual = noPtr.replace("| Licence | MIT |", "| Licence | MIT OR Apache-2.0 |");
  const mitNote = `${dual}\nLicence chosen: MIT. Text in samples/LICENSES/MIT-Ruffle.txt.\n`;
  const apacheOnly = noPtr.replace("| Licence | MIT |", "| Licence | Apache-2.0 |");

  it("accepts a dual-licensed note that names MIT and points to the MIT file", () => {
    expect(validateProvenance(mitNote, { clickSample: true })).toEqual([]);
  });

  it("rejects a dual-licensed note without the MIT pointer", () => {
    const p = validateProvenance(`${dual}\nLicence chosen: MIT.\n`, { clickSample: true });
    expect(p.join()).toMatch(/MIT-Ruffle\.txt/);
  });

  it("rejects a dual-licensed note that does not name MIT as chosen", () => {
    const p = validateProvenance(`${dual}\nSee samples/LICENSES/MIT-Ruffle.txt\n`, { clickSample: true });
    expect(p.join()).toMatch(/chosen option MIT/);
  });

  it("requires the Apache pointer for an Apache-2.0 note", () => {
    expect(validateProvenance(apacheOnly, { clickSample: true }).join()).toMatch(/Apache-2\.0\.txt/);
    const ok = `${apacheOnly}\nSee samples/LICENSES/Apache-2.0.txt\n`;
    expect(validateProvenance(ok, { clickSample: true })).toEqual([]);
  });
});

describe("fields for samples added after Task 1.3 (examples)", () => {
  const fontsBlock = "## Embedded fonts\n\nno embedded fonts\n\n";

  it("rejects a note without the embedded-fonts section", () => {
    const text = good.replace(fontsBlock, "");
    expect(validateProvenance(text, { clickSample: true }).join()).toMatch(/Embedded fonts/);
  });

  it("exempts legacy samples from the fonts section only", () => {
    const text = good.replace(fontsBlock, "");
    expect(validateProvenance(text, { clickSample: true, legacy: true })).toEqual([]);
    const noSha = text.replace(/\| SHA-256 .*\n/, "");
    expect(validateProvenance(noSha, { clickSample: true, legacy: true }).join()).toMatch(/SHA-256/);
  });

  it("accepts a list of fonts and rejects an empty section", () => {
    const list = good.replace("no embedded fonts", "- Arial, font id 3, 120 glyphs");
    expect(validateProvenance(list, { clickSample: true })).toEqual([]);
    const empty = good.replace("no embedded fonts", "TBD");
    expect(validateProvenance(empty, { clickSample: true }).join()).toMatch(/neither a list/);
  });

  it("rejects a note without the SHA-256", () => {
    const text = good.replace(/\| SHA-256 .*\n/, "");
    expect(validateProvenance(text, { clickSample: true }).join()).toMatch(/SHA-256/);
  });

  it("rejects a note without the Licence_Directory pointer", () => {
    const text = good.replace(PTR_LINE, "");
    expect(validateProvenance(text, { clickSample: true }).join()).toMatch(/Licence_Directory/);
  });
});

describe("repository samples", () => {
  const swfs = walk(join(root, "samples"), (n) => n.toLowerCase().endsWith(".swf"));

  it("has at least one sample SWF", () => {
    expect(swfs.length).toBeGreaterThan(0);
  });

  it("has a Click_Sample with a valid Expected_State", () => {
    const note = join(root, "samples", "clickgoto", "PROVENANCE.md");
    expect(existsSync(note), "samples/clickgoto/PROVENANCE.md is missing").toBe(true);
    const rows = parseExpectedState(readFileSync(note, "utf8"));
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  for (const swf of swfs) {
    const rel = relative(root, swf).replace(/\\/g, "/");
    it(`${rel} has a valid PROVENANCE.md`, () => {
      const note = join(dirname(swf), "PROVENANCE.md");
      expect(existsSync(note), `${rel}: PROVENANCE.md is missing`).toBe(true);
      const isClick = dirname(swf).endsWith("clickgoto");
      const legacy = isClick || dirname(swf).endsWith("tweendemo");
      const problems = validateProvenance(readFileSync(note, "utf8"), { clickSample: isClick, legacy });
      expect(problems, `${rel}: ${problems.join("; ")}`).toEqual([]);
    });

    it(`${rel} PROVENANCE.md points only to existing licence files`, () => {
      const text = readFileSync(join(dirname(swf), "PROVENANCE.md"), "utf8");
      for (const p of licencePointers(text)) {
        expect(existsSync(join(root, p)), `${rel}: ${p} does not exist`).toBe(true);
      }
    });
  }
});

describe("sample directories and the Fetched_Sample (Requirement 20)", () => {
  const samplesDir = join(root, "samples");
  const dirs = readdirSync(samplesDir)
    .filter((n) => n !== "LICENSES" && statSync(join(samplesDir, n)).isDirectory())
    .sort();
  for (const name of dirs) {
    it(`samples/${name} is a committed or fetched directory`, () => {
      const kind = classifySampleDir(readdirSync(join(samplesDir, name)));
      expect(kind, `samples/${name}`).not.toBe("invalid");
      if (kind === "fetched") {
        const dir = join(samplesDir, name);
        expect(existsSync(join(dir, "reference")), `samples/${name}/reference`).toBe(true);
        const text = readFileSync(join(dir, "PROVENANCE.md"), "utf8");
        expect(validateProvenance(text, { clickSample: false, fetched: true }), name).toEqual([]);
        expect(validateFetchedNoteRows(text), name).toEqual([]);
      }
    });
  }
  it("does not commit samples/static_text/test.swf", () => {
    expect(existsSync(join(samplesDir, "static_text", "test.swf"))).toBe(false);
  });
  it("accepts the spacer note without a SWF and rejects a committed samples/spacer/*.swf", () => {
    const dir = join(samplesDir, "spacer");
    const text = readFileSync(join(dir, "PROVENANCE.md"), "utf8");
    expect(validateProvenance(text, { clickSample: false, fetched: true })).toEqual([]);
    expect(readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".swf"))).toEqual([]);
    expect(classifySampleDir(readdirSync(dir))).toBe("fetched");
    expect(classifySampleDir([...readdirSync(dir), "test.swf"])).toBe("committed");
  });
  it("admits GPL-3.0 only for a Fetched_Sample that points to the GPL text", () => {
    const text = readFileSync(join(samplesDir, "spacer", "PROVENANCE.md"), "utf8");
    expect(validateProvenance(text, { clickSample: false }).join()).toMatch(/allow-listed/);
    const noPtr = text.replace(/samples\/LICENSES\/GPL-3\.0\.txt/g, "samples/LICENSES/MIT-Ruffle.txt");
    expect(validateProvenance(noPtr, { clickSample: false, fetched: true }).join()).toMatch(/GPL-3\.0\.txt/);
  });
  it("checks the extra rows of a fetched note on a synthetic directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "fetched-"));
    try {
      mkdirSync(join(tmp, "reference"));
      const withRows = `${good}
| Not in the Repository | yes |
| Fetch command | \`npm run fetch:static-text\` |
| Target path | \`.work/samples/static_text/test.swf\` |
| Embedded fonts | Times New Roman, 17 glyphs |
`;
      writeFileSync(join(tmp, "PROVENANCE.md"), withRows);
      expect(classifySampleDir(readdirSync(tmp))).toBe("fetched");
      expect(validateProvenance(withRows, { clickSample: false })).toEqual([]);
      expect(validateFetchedNoteRows(withRows)).toEqual([]);
      expect(validateFetchedNoteRows(good).length).toBe(4);
      expect(validateFetchedNoteRows(withRows.replace("| Fetch command |", "| Other |")).join()).toMatch(/Fetch command/);
      writeFileSync(join(tmp, "test.swf"), "x");
      expect(classifySampleDir(readdirSync(tmp))).toBe("committed");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
describe("acid-color-2 (Apache-2.0, Shumway)", () => {
  const note = readFileSync(join(root, "samples", "acid-color-2", "PROVENANCE.md"), "utf8");

  it("is Apache-2.0 only with the Apache pointer", () => {
    expect(note).toMatch(/\| Licence\s*\| Apache-2\.0 \|/);
    expect(licencePointers(note)).toEqual(["samples/LICENSES/Apache-2.0.txt"]);
  });

  it("carries the Shumway attribution", () => {
    expect(note).toContain("https://github.com/mozilla/shumway/tree/master/test/swfs");
    expect(note).toContain("https://github.com/mozilla/shumway/blob/master/LICENSE");
    expect(note).toContain("from_shumway");
  });

  it("states that mozilla/shumway ships no NOTICE file", () => {
    expect(note).toMatch(/`mozilla\/shumway` ships no NOTICE file/);
    expect(note).toContain("16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0");
  });

  it("has the reference files and fixtures", () => {
    for (const p of [
      "samples/acid-color-2/reference/output.txt",
      "samples/acid-color-2/reference/test.toml",
      "test/fixtures/acid-color-2/structure.xml",
      "test/fixtures/acid-color-2/FINDINGS.md",
      "test/fixtures/acid-color-2/shapes/1.svg",
    ]) {
      expect(existsSync(join(root, p)), p).toBe(true);
    }
  });
});

describe("3_joystick (Apache-2.0, Shumway)", () => {
  const note = readFileSync(join(root, "samples", "3_joystick", "PROVENANCE.md"), "utf8");
  it("is Apache-2.0 only with the Apache pointer, Shumway attribution and no NOTICE", () => {
    expect(note).toMatch(/\| Licence\s*\| Apache-2\.0 \|/);
    expect(licencePointers(note)).toEqual(["samples/LICENSES/Apache-2.0.txt"]);
    expect(note).toContain("https://github.com/mozilla/shumway/blob/master/LICENSE");
    expect(note).toMatch(/`mozilla\/shumway` ships no NOTICE file/);
    expect(note).toContain("no embedded fonts");
  });
  it("has the reference files and fixtures", () => {
    for (const p of [
      "samples/3_joystick/reference/input.json",
      "samples/3_joystick/reference/output.txt",
      "samples/3_joystick/reference/test.toml",
      "test/fixtures/3_joystick/structure.xml",
      "test/fixtures/3_joystick/symbols.csv",
      "test/fixtures/3_joystick/FINDINGS.md",
      "test/fixtures/3_joystick/code/Interactivity3.as",
    ]) {
      expect(existsSync(join(root, p)), p).toBe(true);
    }
  });
});
describe("slider_component (Apache-2.0, Shumway)", () => {
  const note = readFileSync(join(root, "samples", "slider_component", "PROVENANCE.md"), "utf8");
  it("is Apache-2.0 only with the Apache pointer, Shumway attribution and no NOTICE", () => {
    expect(note).toMatch(/\| Licence\s*\| Apache-2\.0 \|/);
    expect(licencePointers(note)).toEqual(["samples/LICENSES/Apache-2.0.txt"]);
    expect(note).toContain("https://github.com/mozilla/shumway/blob/master/LICENSE");
    expect(note).toMatch(/`mozilla\/shumway` ships no NOTICE file/);
    expect(note).toContain("no embedded fonts");
    expect(note).toContain("bf6dbcb755b764beeb0c8d68af24438d803b2e39e7d171fc663551d364593e9b");
  });
  it("has the reference files and fixtures", () => {
    for (const p of [
      "samples/slider_component/reference/input.json",
      "samples/slider_component/reference/output.txt",
      "samples/slider_component/reference/test.toml",
      "test/fixtures/slider_component/structure.xml",
      "test/fixtures/slider_component/symbols.csv",
      "test/fixtures/slider_component/fl/controls/Slider.as",
      "test/fixtures/slider_component/slider1_fla/MainTimeline.as",
    ]) {
      expect(existsSync(join(root, p)), p).toBe(true);
    }
    expect(walk(join(root, "test", "fixtures", "slider_component"), (n) => n.endsWith(".as"))).toHaveLength(27);
  });
});
describe("repository rules", () => {
  it("keeps every sample input.json under reference/", () => {
    const inputs = walk(join(root, "samples"), (n) => n === "input.json");
    for (const f of inputs) {
      expect(relative(root, dirname(f)).replace(/\\/g, "/"), relative(root, f)).toMatch(/^samples\/[^/]+\/reference$/);
    }
  });  it("has no _loc<N>_ placeholders in handwritten/", () => {
    const files = walk(join(root, "handwritten"), (n) => /\.(ts|js|as)$/.test(n));
    for (const f of files) {
      expect(readFileSync(f, "utf8"), relative(root, f)).not.toMatch(/_loc\d+_/);
    }
  });

  it("has no LLM client in package.json dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
    const names: string[] = [];
    for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const section = pkg[key];
      if (section && typeof section === "object") names.push(...Object.keys(section));
    }
    const llm = /^(openai|@anthropic-ai\/.+|anthropic|@google\/generative-ai|@google\/genai|@aws-sdk\/client-bedrock.*|langchain|@langchain\/.+|ollama|cohere-ai|@mistralai\/.+|groq-sdk|ai|@ai-sdk\/.+|llamaindex|@huggingface\/inference)$/;
    expect(names.filter((n) => llm.test(n))).toEqual([]);
  });
});

describe("licence texts", () => {
  const apache = join(root, "samples", "LICENSES", "Apache-2.0.txt");
  const mit = join(root, "samples", "LICENSES", "MIT-Ruffle.txt");

  it("has both licence files", () => {
    expect(existsSync(apache)).toBe(true);
    expect(existsSync(mit)).toBe(true);
  });

  it("Apache-2.0.txt is non-empty and starts with the Apache licence title", () => {
    const text = readFileSync(apache, "utf8");
    expect(text.length).toBeGreaterThan(0);
    expect(text.trimStart().startsWith("Apache License")).toBe(true);
  });

  it("MIT-Ruffle.txt holds the Ruffle copyright line", () => {
    expect(readFileSync(mit, "utf8")).toContain(
      "Copyright (c) 2018-2022 Ruffle LLC <ruffle@ruffle.rs> and Ruffle contributors",
    );
  });
});
