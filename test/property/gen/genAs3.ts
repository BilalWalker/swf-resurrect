import fc from "fast-check";

/**
 * AS3 source generators for the Transpiler properties (translate spec, Properties 1 to 3).
 *
 * `genProgram` builds a package with one class. Every statement and member carries a unique
 * marker string (`"MK<n>_"`, the trailing underscore keeps `MK1_` from matching inside `MK10_`).
 * The generator records, independently of the Transpiler, the marker, the 1-based line the
 * statement starts on in the generated text, and whether the statement is unsupported.
 * `genSoup` builds unstructured token sequences.
 */

/** One generated statement or member, as expected by the line-accounting property. */
export interface MarkedStatement {
  /** Unique marker; appears exactly once in the source text. */
  marker: string;
  /** 1-based line of the statement's first source line, counting `\n` and `\r\n` as one break. */
  firstLine: number;
  /** True when the Transpiler must report one `unsupported-construct` at `firstLine`. */
  unsupported: boolean;
}

export interface GeneratedProgram {
  /** Source text with mixed `\n` / `\r\n` line endings. */
  source: string;
  /** Every marked statement or member, in source order. */
  statements: MarkedStatement[];
  /** Number of source lines (a final line terminator does not start another line). */
  lineCount: number;
}

// ---------------------------------------------------------------------------
// Plan (marker-free description) -> render (assigns markers and lines)
// ---------------------------------------------------------------------------

type SimpleForm =
  | "assign" | "trace" | "varInt" | "varUint" | "isOp" | "asOp"
  | "parent" | "vector" | "ternary" | "call";

type UnsupportedForm = "try" | "tryFinally" | "switch" | "with" | "delete" | "nestedFn" | "e4x";

type CompoundForm = "if" | "while" | "for" | "forEach";

type Stmt =
  | { k: "simple"; form: SimpleForm }
  | { k: "unsupported"; form: UnsupportedForm }
  | { k: "compound"; form: CompoundForm; braced: boolean; body: Stmt[] }
  | { k: "blank" }
  | { k: "lineComment" }
  | { k: "blockComment" };

type Member =
  | { k: "field"; konst: boolean }
  | { k: "getter" }
  | { k: "setter" }
  | { k: "method"; body: Stmt[] };

interface ProgramPlan {
  imports: string[];
  metadata: boolean;
  extendsSprite: boolean;
  ctorBody: Stmt[] | null;
  members: Member[];
  /** Line terminators, cycled by line index; true is `\r\n`. */
  crlf: boolean[];
  finalNewline: boolean;
}

const simpleForms: SimpleForm[] = [
  "assign", "trace", "varInt", "varUint", "isOp", "asOp", "parent", "vector", "ternary", "call",
];
const unsupportedForms: UnsupportedForm[] = [
  "try", "tryFinally", "switch", "with", "delete", "nestedFn", "e4x",
];
const compoundForms: CompoundForm[] = ["if", "while", "for", "forEach"];

const genSimple: fc.Arbitrary<Stmt> = fc
  .constantFrom(...simpleForms)
  .map((form) => ({ k: "simple", form }) as Stmt);

const genUnsupported: fc.Arbitrary<Stmt> = fc
  .constantFrom(...unsupportedForms)
  .map((form) => ({ k: "unsupported", form }) as Stmt);

const genFiller: fc.Arbitrary<Stmt> = fc.constantFrom<Stmt>(
  { k: "blank" },
  { k: "lineComment" },
  { k: "blockComment" },
);

/** Statement list. `depth` bounds compound nesting. */
function genStmts(depth: number): fc.Arbitrary<Stmt[]> {
  const leaves: Array<fc.Arbitrary<Stmt>> = [
    genSimple, genSimple, genSimple, genUnsupported, genFiller,
  ];
  if (depth > 0) {
    leaves.push(
      fc
        .record({
          form: fc.constantFrom(...compoundForms),
          braced: fc.boolean(),
          body: genStmts(depth - 1),
        })
        .map(({ form, braced, body }): Stmt => {
          // An unbraced body is exactly one simple statement.
          const simple = body.find((s) => s.k === "simple");
          if (!braced && simple !== undefined) return { k: "compound", form, braced, body: [simple] };
          return { k: "compound", form, braced: true, body };
        }),
    );
  }
  return fc.array(fc.oneof(...leaves), { minLength: 0, maxLength: 5 });
}

const genMember: fc.Arbitrary<Member> = fc.oneof(
  fc.boolean().map((konst): Member => ({ k: "field", konst })),
  fc.constant<Member>({ k: "getter" }),
  fc.constant<Member>({ k: "setter" }),
  genStmts(2).map((body): Member => ({ k: "method", body })),
);

const importPool = [
  "flash.display.*",
  "flash.events.*",
  "flash.display.Sprite",
  "flash.display.MovieClip",
  "flash.events.Event",
];

const genPlan: fc.Arbitrary<ProgramPlan> = fc.record({
  imports: fc.uniqueArray(fc.constantFrom(...importPool), { maxLength: 4 }),
  metadata: fc.boolean(),
  extendsSprite: fc.boolean(),
  ctorBody: fc.option(genStmts(1), { nil: null }),
  members: fc.array(genMember, { minLength: 0, maxLength: 6 }),
  crlf: fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
  finalNewline: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

class Renderer {
  readonly lines: string[] = [];
  readonly statements: MarkedStatement[] = [];
  private n = 0;

  private nextMarker(): string {
    this.n += 1;
    return `MK${this.n}_`;
  }

  /** Append lines; record a marked statement whose first line is the first appended line. */
  private mark(unsupported: boolean, build: (m: string) => string[]): void {
    const marker = this.nextMarker();
    const firstLine = this.lines.length + 1;
    this.lines.push(...build(marker));
    this.statements.push({ marker, firstLine, unsupported });
  }

  plain(line: string): void {
    this.lines.push(line);
  }

  stmts(list: Stmt[], ind: string): void {
    for (const s of list) this.stmt(s, ind);
  }

  private stmt(s: Stmt, ind: string): void {
    switch (s.k) {
      case "blank":
        this.plain("");
        return;
      case "lineComment":
        this.plain(`${ind}// a line comment with { and " inside`);
        return;
      case "blockComment":
        this.plain(`${ind}/*`);
        this.plain(`${ind} * a block comment; }`);
        this.plain(`${ind} */`);
        return;
      case "simple":
        this.mark(false, (m) => [ind + simpleText(s.form, m)]);
        return;
      case "unsupported":
        this.mark(true, (m) => unsupportedLines(s.form, m).map((l) => ind + l));
        return;
      case "compound": {
        const inner = ind + "   ";
        this.mark(false, (m) => [ind + compoundHeader(s.form, m)]);
        if (s.braced) {
          this.plain(`${ind}{`);
          this.stmts(s.body, inner);
          this.plain(`${ind}}`);
        } else {
          this.stmts(s.body, inner);
        }
      }
    }
  }

  member(m: Member, ind: string): void {
    const inner = ind + "   ";
    switch (m.k) {
      case "field":
        this.mark(false, (mk) => [
          `${ind}public ${m.konst ? "const" : "var"} f${this.n}:String = "${mk}";`,
        ]);
        this.plain("");
        return;
      case "getter":
        this.mark(false, (mk) => [
          `${ind}public function get p${this.n}() : String`,
          `${ind}{`,
          `${inner}return "${mk}";`,
          `${ind}}`,
        ]);
        this.plain("");
        return;
      case "setter":
        this.mark(false, (mk) => [
          `${ind}public function set p${this.n}(v:String) : void`,
          `${ind}{`,
          `${inner}x = "${mk}";`,
          `${ind}}`,
        ]);
        this.plain("");
        return;
      case "method": {
        this.mark(false, (mk) => [`${ind}public function m${this.n}(a:String = "${mk}", ...rest) : void`]);
        this.plain(`${ind}{`);
        this.stmts(m.body, inner);
        this.plain(`${ind}}`);
        this.plain("");
      }
    }
  }
}

function simpleText(form: SimpleForm, m: string): string {
  switch (form) {
    case "assign": return `x = "${m}";`;
    case "trace": return `trace("${m}", x);`;
    case "varInt": return `var n:int = int("${m}".length + x);`;
    case "varUint": return `var u:uint = uint(x ? "${m}".length : 0);`;
    case "isOp": return `var b:Boolean = x is Sprite && "${m}" != null;`;
    case "asOp": return `var s:Sprite = (x as Sprite) || "${m}";`;
    case "parent": return `this.parent.foo("${m}");`;
    case "vector": return `var v:Vector.<String> = new Vector.<String>("${m}");`;
    case "ternary": return `y = x ? "${m}" : z;`;
    case "call": return `foo("${m}", 1 + 2);`;
  }
}

function compoundHeader(form: CompoundForm, m: string): string {
  switch (form) {
    case "if": return `if(x != "${m}")`;
    case "while": return `while(x != "${m}")`;
    case "for": return `for(i = 0; i < "${m}".length; i += 1)`;
    case "forEach": return `for each(var item:String in ["${m}"])`;
  }
}

function unsupportedLines(form: UnsupportedForm, m: string): string[] {
  switch (form) {
    case "try":
      return ["try", "{", `   trace("${m}");`, "}", "catch(e:Error)", "{", "   trace(e);", "}"];
    case "tryFinally":
      return [
        "try", "{", `   trace("${m}");`, "}", "catch(e:Error)", "{", "}", "finally", "{", "   done = true;", "}",
      ];
    case "switch":
      return ["switch(x)", "{", "   case 1:", `      trace("${m}");`, "      break;", "}"];
    case "with":
      return ["with(x)", "{", `   trace("${m}");`, "}"];
    case "delete":
      return [`delete x["${m}"];`];
    case "nestedFn":
      return ["function inner() : void", "{", `   trace("${m}");`, "}"];
    case "e4x":
      return [`trace(x..name, "${m}");`];
  }
}

function render(plan: ProgramPlan): GeneratedProgram {
  const r = new Renderer();
  r.plain("package");
  r.plain("{");
  for (const imp of plan.imports) r.plain(`   import ${imp};`);
  r.plain("   ");
  if (plan.metadata) r.plain('   [SWF(width="550", height="400")]');
  r.plain(`   public class Gen${plan.extendsSprite ? " extends Sprite" : ""}`);
  r.plain("   {");
  r.plain("      ");
  for (const m of plan.members) r.member(m, "      ");
  if (plan.ctorBody !== null) {
    r.plain("      public function Gen()");
    r.plain("      {");
    r.stmts(plan.ctorBody, "         ");
    r.plain("      }");
  }
  r.plain("   }");
  r.plain("}");

  let source = "";
  r.lines.forEach((line, i) => {
    const last = i === r.lines.length - 1;
    if (last && !plan.finalNewline) {
      source += line;
    } else {
      source += line + (plan.crlf[i % plan.crlf.length] ? "\r\n" : "\n");
    }
  });
  return { source, statements: r.statements, lineCount: r.lines.length };
}

/** Marked AS3 programs with supported and unsupported statements, blanks, comments, mixed EOLs. */
export const genProgram: fc.Arbitrary<GeneratedProgram> = genPlan.map(render);

// ---------------------------------------------------------------------------
// Token soup
// ---------------------------------------------------------------------------

const soupTokens: string[] = [
  "package", "class", "public", "private", "internal", "static", "override", "function", "var",
  "const", "get", "set", "extends", "import", "if", "else", "for", "each", "in", "while", "do",
  "return", "try", "catch", "finally", "switch", "case", "with", "delete", "new", "is", "as",
  "int", "uint", "Number", "Vector.<int>", "Vector.<", ">", "*", "this", "super", "null",
  "{", "}", "(", ")", "[", "]", ";", ":", ",", ".", "..", "::", "@", "...", "=", "==", "!==",
  "+", "-", "/", "%", "<", ">>>=", "&&", "||", "!", "?",
  "x", "y", "foo", "Sprite", "0", "12", "3.5", "0xFF",
  '"str"', "'str'", '"unterminated', "'unterminated", "/* unterminated", "/* c */", "// c",
  "/re/g", '"a\u2028b"', "// c\u2029d", "/* \u2028 */", '[SWF(width="1")]',
];

const soupSeparators = [" ", " ", "\n", "\r\n", "\t", "\u2028", "\u2029", ""];

/** Unstructured AS3 token sequences: unbalanced braces, unterminated strings and comments. */
export const genSoup: fc.Arbitrary<string> = fc
  .array(
    fc.tuple(fc.constantFrom(...soupTokens), fc.constantFrom(...soupSeparators)),
    { minLength: 0, maxLength: 60 },
  )
  .map((parts) => parts.map(([t, sep]) => t + sep).join(""));
