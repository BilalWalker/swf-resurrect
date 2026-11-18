// Task 2.3 (robustness Requirements 2.8, 10.2): each JSON example of docs/outcome.md equals the writer's output.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXIT_CODES } from "../../src/outcome/exitCode";
import { serialiseOutcome } from "../../src/outcome/outcomeFile";
import { EXAMPLES } from "../support/outcomeExamples";

const doc = readFileSync("docs/outcome.md", "utf8").replace(/\r\n/g, "\n");

/** Fenced json blocks under each `### <outcome>` heading. */
function exampleFor(name: string): string {
  const m = new RegExp("### " + name + "\\n\\n```json\\n([\\s\\S]*?)\\n```").exec(doc);
  if (!m) throw new Error(`no example for ${name}`);
  return m[1] + "\n";
}

describe("docs/outcome.md", () => {
  for (const name of Object.keys(EXAMPLES) as (keyof typeof EXAMPLES)[]) {
    it(`the ${name} example is the writer's output`, () => {
      expect(exampleFor(name)).toBe(serialiseOutcome(EXAMPLES[name]));
    });
  }

  it("has exactly four fenced json examples", () => {
    expect(doc.match(/```json/g)?.length).toBe(4);
  });

  it("the embeddedSwfs example is the writer's output", () => {
    const text = serialiseOutcome({ ...EXAMPLES.converted, embeddedSwfs: { count: 1, totalBytes: 7349081, largestBytes: 7349081 } });
    expect(JSON.stringify(JSON.parse(text).embeddedSwfs)).toBe('{"count":1,"largestBytes":7349081,"totalBytes":7349081}');
    expect(doc).toContain('"embeddedSwfs": {"count":1,"largestBytes":7349081,"totalBytes":7349081}');
    expect(doc).toContain("the file is a wrapper around another SWF that was not converted (N embedded, X MiB); ");
  });
  it("lists every exit code of the table", () => {
    for (const [outcome, code] of Object.entries(EXIT_CODES)) {
      if (outcome === "usage") continue;
      expect(doc).toContain(`| ${code} | \`${outcome}\` |`);
    }
  });

  it("states the web kill and O14 notes", () => {
    expect(doc).toContain("180 s");
    expect(doc).toContain("O14");
    expect(doc).toContain("`numbers` is `null` for a refusal before Translate");
  });
});
