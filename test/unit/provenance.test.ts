import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isAllowedLicence,
  parseExpectedState,
  validateProvenance,
} from "../support/provenance";

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

const good = `| Field | Value |
|---|---|
| Author | A |
| Source URL | https://example.com/x |
| Licence | MIT |

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
      const problems = validateProvenance(readFileSync(note, "utf8"), { clickSample: isClick });
      expect(problems, `${rel}: ${problems.join("; ")}`).toEqual([]);
    });
  }
});

describe("repository rules", () => {
  it("has no _loc<N>_ placeholders in handwritten/", () => {
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
