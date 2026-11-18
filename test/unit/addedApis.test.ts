import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Requirements 14.10, 14.17, 19.5, 15.10: every Shim API added beyond the brief has a row in ADDED_APIS.md
// that names a fixture line or states why it only supports another API.
const shimFiles = readdirSync("template/shim").filter((f) => f.endsWith(".ts"));
const shimText = (name: string): string => readFileSync(`template/shim/${name}`, "utf8");
// The generated stubs (template/shim/stubs/, robustness task 14.2) are Shim sources too.
const stubFiles = readdirSync("template/shim/stubs").filter((f) => f.endsWith(".ts")).map((f) => `stubs/${f}`);
const allShim = [...shimFiles, ...stubFiles].map(shimText).join("\n");
const rows = readFileSync("template/shim/ADDED_APIS.md", "utf8")
  .split(/\r?\n/)
  .filter((l) => l.startsWith("| ") && !l.startsWith("| ---") && !l.startsWith("| API |"))
  .map((l) => {
    const cells = l.split(/\s\|\s/);
    return { api: cells[0].replace(/^\|\s*/, ""), needed: cells.slice(1).join(" | ") };
  });

const FIXTURE_LINE = /\b[A-Za-z0-9_]+\.as:\d+/;
const SUPPORT_REASON = /^(Support|Supports)\b|No AS3 fixture line|Support only|^Same lines/;

function rowFor(name: string): { api: string; needed: string } | undefined {
  const parts = name.split(".");
  const last = parts[parts.length - 1];
  const qualifier = parts.length > 1 ? parts[0] : null;
  const word = (w: string): RegExp => new RegExp(`(?<![\\w$])${w}(?![\\w$])`);
  return rows.find((r) => word(last).test(r.api) && (qualifier === null || word(qualifier).test(r.api)));
}

function expectJustified(name: string): void {
  const row = rowFor(name);
  expect(row, `ADDED_APIS.md has no row for ${name}`).toBeDefined();
  const ok = FIXTURE_LINE.test(row!.needed) || SUPPORT_REASON.test(row!.needed);
  expect(ok, `row for ${name} names no fixture line and gives no support reason`).toBe(true);
}

describe("ADDED_APIS.md", () => {
  it("has a justified row for every MouseEvent.MOUSE_* constant in the Shim", () => {
    const names = [...shimText("events.ts").matchAll(/static readonly (MOUSE_[A-Z_]+)\b/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expectJustified(`MouseEvent.${n}`);
  });

  it("has a justified row for mouseX, mouseY, Stage, DisplayObject.stage and ClipHooks.entryUpdated", () => {
    expect(shimText("DisplayObject.ts")).toMatch(/get mouseX\(\)/);
    expect(shimText("DisplayObject.ts")).toMatch(/get mouseY\(\)/);
    expect(shimText("DisplayObject.ts")).toMatch(/get stage\(\)/);
    expect(shimText("Stage.ts")).toMatch(/export class Stage\b/);
    expect(shimText("internal.ts")).toMatch(/entryUpdated\?\(/);
    for (const n of ["DisplayObject.mouseX", "DisplayObject.mouseY", "Stage", "DisplayObject.stage", "ClipHooks.entryUpdated"]) {
      expectJustified(n);
    }
  });

  it("has a justified row for every Default_Instance_Name and Caught_Error helper", () => {
    for (const n of ["takeInstanceNumber", "defaultInstanceName", "setCaughtErrorSink", "reportCaughtError", "clipsPreOrder", "clipsPostOrder"]) {
      expect(allShim).toContain(`function ${n}(`);
      expectJustified(n);
    }
  });

  it("names no API that the Shim does not contain", () => {
    const missing: string[] = [];
    for (const r of rows) {
      for (const span of r.api.matchAll(/`([^`]+)`/g)) {
        const head = span[1].split("(")[0].replace(/\s+\(type\)$/, "");
        const id = head.split("/")[0].trim().split(".").pop() ?? "";
        if (/^[A-Za-z_$][\w$]*$/.test(id) && !allShim.includes(id) && !readFileSync("template/runtime/player.ts", "utf8").includes(id)) {
          missing.push(span[1]);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("gives every row a fixture line or a support reason", () => {
    const bad = rows.filter((r) => !FIXTURE_LINE.test(r.needed) && !SUPPORT_REASON.test(r.needed)).map((r) => r.api);
    expect(bad).toEqual([]);
  });
});
