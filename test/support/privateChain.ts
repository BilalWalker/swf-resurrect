import { planTranslate } from "../../src/translate/planTranslate";
import { tsSyntaxCheck } from "../../src/translate/tsSyntaxCheck";
import { evalTranslated } from "./evalTranslated";

export const scene = (names: string[]) =>
  ({
    formatVersion: 1,
    rootSymbolId: 0,
    symbols: Object.fromEntries(names.map((c, i) => [String(i), { type: "sprite", frames: [], labels: {}, className: c }])),
  }) as never;

/** Translates the sources and evaluates every class in order; returns the exports by class name. */
export function translateAndRun(
  sources: Array<{ className: string; source: string }>,
): { texts: Map<string, string>; classes: Record<string, any> } {
  const plan = planTranslate(sources, scene([sources[sources.length - 1]!.className]), tsSyntaxCheck);
  const texts = new Map(plan.classes.map((c) => [c.className, c.text] as const));
  const registry: Record<string, any> = {};
  const modules = new Proxy({} as Record<string, unknown>, {
    has: (_t, spec: string) => Object.hasOwn(registry, String(spec).split("/").pop()!.replace(/\.js$/, "")) || /shim|runtime/.test(String(spec)),
    get: (_t, spec: string) => registry[String(spec).split("/").pop()!.replace(/\.js$/, "")] ?? {},
  });
  const classes: Record<string, any> = {};
  for (const s of sources) {
    const exports = evalTranslated(texts.get(s.className)!, modules);
    registry[s.className] = exports;
    classes[s.className] = exports[s.className];
  }
  return { texts, classes };
}

/** One class of a chain: private fields (bare and this. uses), a private method, a public reader. */
export function chainSource(k: number, fields: string[], base: string | null): { className: string; source: string } {
  const decl = fields.map((f, i) => `    private var ${f}:int = ${(k + 1) * 10 + i};`).join("\n");
  const sum = fields.map((f, i) => (i % 2 === 0 ? f : `this.${f}`)).join(" + ");
  const source =
    `package {\n  public class C${k}${base === null ? "" : ` extends ${base}`} {\n${decl}\n` +
    `    private function pm():int { return ${sum}; }\n` +
    `    public function read${k}():int { return pm(); }\n  }\n}\n`;
  return { className: `C${k}`, source };
}
