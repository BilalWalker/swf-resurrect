// Generators for Property 37 (Shim declaration extraction): declaration text plus the table it must give.
import fc from "fast-check";
import type { ShimMemberTable, ShimSource } from "../../../src/translate/shimMembers";

type Style = "plain" | "asi";
type MemberSpec =
  | { form: "method"; name: string; hidden: "none" | "private" | "static" | "underscore"; generic: boolean; body: number }
  | { form: "property"; name: string; hidden: "none" | "private" | "static" | "underscore"; init: number; style: Style }
  | { form: "accessor"; name: string; hidden: "none" | "private" | "static"; setter: boolean }
  | { form: "ctor"; params: Array<{ name: string; mod: "none" | "readonly" | "public" | "private" | "protected" | "underscore" }> };

interface ClassSpec {
  name: string;
  base: number | null; // index of an earlier class
  members: MemberSpec[];
  noise: number;
  file: number;
}

export interface ShimCase {
  sources: ShimSource[];
  expected: ShimMemberTable;
}

const memberName = fc.constantFrom("alpha", "beta", "gamma", "get", "set", "readonly", "static", "async", "type", "stage", "x", "y", "value$", "n1");
const hidden3 = fc.constantFrom("none", "none", "private", "static", "underscore") as fc.Arbitrary<"none" | "private" | "static" | "underscore">;

const memberSpec: fc.Arbitrary<MemberSpec> = fc.oneof(
  fc.record({ form: fc.constant("method" as const), name: memberName, hidden: hidden3, generic: fc.boolean(), body: fc.integer({ min: 0, max: 3 }) }),
  fc.record({
    form: fc.constant("property" as const),
    name: memberName,
    hidden: hidden3,
    init: fc.integer({ min: 0, max: 5 }),
    style: fc.constantFrom("plain" as const, "asi" as const),
  }),
  fc.record({
    form: fc.constant("accessor" as const),
    name: memberName,
    hidden: fc.constantFrom("none" as const, "private" as const, "static" as const),
    setter: fc.boolean(),
  }),
);

const ctorSpec: fc.Arbitrary<MemberSpec> = fc.record({
  form: fc.constant("ctor" as const),
  params: fc.array(
    fc.record({
      name: memberName,
      mod: fc.constantFrom("none", "readonly", "public", "private", "protected", "underscore") as fc.Arbitrary<
        "none" | "readonly" | "public" | "private" | "protected" | "underscore"
      >,
    }),
    { maxLength: 4 },
  ),
});

const BODIES = [
  "{}",
  "{ return { a: 1 }; }",
  "{ const s = '}{ class Fake { x } //'; return s; }",
  "{ return `a${'{'}b${`}`}`; }",
];
const INITS = ["1", "'a}b'", "() => { return 1; }", "new Map<string, number>()", "`t${1 + 1}}`", "[]"];

function prefix(h: string): string {
  return h === "private" ? "private " : h === "static" ? "static " : "";
}
function actualName(name: string, h: string): string {
  return h === "underscore" ? `_${name}` : name;
}

function renderMember(m: MemberSpec, ctorHost: string): string {
  switch (m.form) {
    case "method": {
      const n = actualName(m.name, m.hidden);
      const gen = m.generic ? "<T extends { a: number }>" : "";
      return `  ${prefix(m.hidden)}${n}${gen}(a: number, b?: Map<string, readonly number[]>): { r: number } ${BODIES[m.body]!}`;
    }
    case "property": {
      const n = actualName(m.name, m.hidden);
      const end = m.style === "plain" ? ";" : "";
      return `  ${prefix(m.hidden)}${n}: ReadonlyArray<{ a: string }> = ${INITS[m.init]!}${end}`;
    }
    case "accessor": {
      const get = `  ${prefix(m.hidden)}get ${m.name}(): number { return 1; }`;
      return m.setter ? `${get}\n  ${prefix(m.hidden)}set ${m.name}(v: number) { void v; }` : get;
    }
    case "ctor": {
      const ps = m.params.map((p, i) => {
        const n = p.mod === "underscore" ? `_${p.name}${i}` : `${p.name}${i}`;
        const mod = p.mod === "none" || p.mod === "underscore" ? "" : `${p.mod} `;
        const tail = i % 2 === 0 ? ": Map<string, readonly number[]>" : " = 1";
        return `${p.mod === "underscore" ? "readonly " : mod}${n}${tail}`;
      });
      return `  constructor(${ps.join(", ")}) { super${ctorHost}; }`;
    }
  }
}

function expectedMembers(c: ClassSpec): Array<{ name: string; kind: "method" | "property" }> {
  const seen = new Map<string, "method" | "property">();
  const add = (n: string, kind: "method" | "property"): void => {
    if (!seen.has(n)) seen.set(n, kind);
  };
  for (const m of c.members) {
    if (m.form === "method" && (m.hidden === "none")) add(m.name, "method");
    else if (m.form === "property" && m.hidden === "none") add(m.name, "property");
    else if (m.form === "accessor" && m.hidden === "none") add(m.name, "property");
    else if (m.form === "ctor") {
      m.params.forEach((p, i) => {
        if (p.mod === "readonly" || p.mod === "public" || p.mod === "protected") add(`${p.name}${i}`, "property");
      });
    }
  }
  return [...seen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([name, kind]) => ({ name, kind }));
}

/** Names that collide between kinds inside one class make the extractor throw; keep classes consistent. */
function consistent(c: ClassSpec): boolean {
  const kinds = new Map<string, string>();
  const note = (n: string, k: string): boolean => {
    const p = kinds.get(n);
    if (p !== undefined && p !== k) return false;
    kinds.set(n, k);
    return true;
  };
  for (const m of c.members) {
    if (m.form === "method" && m.hidden === "none" && !note(m.name, "method")) return false;
    if (m.form === "property" && m.hidden === "none" && !note(m.name, "property")) return false;
    if (m.form === "accessor" && m.hidden === "none" && !note(m.name, "property")) return false;
    if (m.form === "ctor") for (let i = 0; i < m.params.length; i++) {
      const p = m.params[i]!;
      if ((p.mod === "readonly" || p.mod === "public" || p.mod === "protected") && !note(`${p.name}${i}`, "property")) return false;
    }
  }
  return true;
}

export const genShimCase: fc.Arbitrary<ShimCase> = fc
  .record({
    count: fc.integer({ min: 1, max: 5 }),
    seeds: fc.array(
      fc.record({
        base: fc.option(fc.nat(), { nil: null }),
        members: fc.array(fc.oneof(memberSpec, memberSpec, ctorSpec), { maxLength: 6 }),
        noise: fc.integer({ min: 0, max: 3 }),
        file: fc.integer({ min: 0, max: 2 }),
        exported: fc.boolean(),
      }),
      { minLength: 5, maxLength: 5 },
    ),
  })
  .map(({ count, seeds }): ShimCase => {
    const classes: ClassSpec[] = [];
    const exportedNames: string[] = [];
    for (let i = 0; i < count; i++) {
      const s = seeds[i]!;
      const all: MemberSpec[] = s.members;
      const members: MemberSpec[] = [...all.filter((m) => m.form !== "ctor"), ...all.filter((m) => m.form === "ctor").slice(0, 1)];
      const c: ClassSpec = {
        name: `K${i}`,
        base: i === 0 || s.base === null ? null : s.base % i,
        members,
        noise: s.noise,
        file: s.file,
      };
      // Keep generated members that clash in kind out of the case: drop later clashes.
      while (!consistent(c)) c.members.pop();
      classes.push(c);
      if (s.exported || i === count - 1) exportedNames.push(c.name);
    }
    const NOISE = [
      "  // private hidden: number;",
      "  /* class Fake { visible: number; } */",
      "  /** doc with { braces } and `ticks` */",
      "",
    ];
    const fileTexts: string[][] = [[], [], []];
    for (const c of classes) {
      const head = `export class ${c.name}${c.base === null ? "" : ` extends K${c.base}`} {`;
      const lines = [head];
      for (const m of c.members) {
        lines.push(NOISE[c.noise % NOISE.length]!, renderMember(m, "()"));
      }
      lines.push("}");
      // 'super' only makes sense for a base; replace for base-less classes
      const body = (c.base === null ? lines.map((l) => l.split(" super();").join("")) : lines).join("\n");
      fileTexts[c.file % 3]!.push(body);
    }
    const sources: ShimSource[] = [];
    const names = ["A.ts", "B.ts", "C.ts"];
    fileTexts.forEach((parts, i) => {
      if (parts.length > 0) sources.push({ path: names[i]!, text: `import { Z } from './Z';\n${parts.join("\n\n")}\n` });
    });
    const indexLines = [
      "// Public surface",
      `export { ${exportedNames.join(", ")} } from './A';`,
      "export type { Listener } from './events';",
      "export { trace } from './trace';",
    ];
    sources.push({ path: "index.ts", text: indexLines.join("\n") + "\n" });

    // Expected: exported plus every base reached.
    const keep = new Set<string>();
    for (const n of exportedNames) {
      let idx: number | null = Number(n.slice(1));
      while (idx !== null && !keep.has(`K${idx}`)) {
        keep.add(`K${idx}`);
        idx = classes[idx]!.base;
      }
    }
    const expected: Record<string, { extends: string | null; members: Array<{ name: string; kind: "method" | "property" }> }> = {};
    for (const c of classes) {
      if (keep.has(c.name)) expected[c.name] = { extends: c.base === null ? null : `K${c.base}`, members: expectedMembers(c) };
    }
    return { sources, expected };
  });

/** Arbitrary tables for the render/parse round trip. */
export const genShimTable: fc.Arbitrary<ShimMemberTable> = genShimCase.map((c) => c.expected);
