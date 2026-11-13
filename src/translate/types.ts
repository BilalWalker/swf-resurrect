/** Type-only definitions shared by the pure Transpiler files. No runtime code. */
import type { MemberTables } from './memberTables';

export type DiagnosticKind = 'unsupported-construct' | 'loose-type' | 'class-omitted' | 'unresolved-identifier' | 'child-field-initialiser';

/** `line` is 1-based. */
export interface Diagnostic {
  kind: DiagnosticKind;
  line: number;
  message: string;
}

export type SyntaxCheck = (tsText: string) => ReadonlyArray<{ line: number; message: string }>;

export interface TranslateOptions {
  /** AS3-visible names the Shim exports. */
  shimNames: ReadonlySet<string>;
  /** Member tables of every class with a source plus the Shim; absent: built from the file itself. */
  tables?: MemberTables;
  /** Qualified_Name of the class this file declares (path-derived). */
  selfQualified: string;
  /** Qualified_Names of the other classes exported next to this file. */
  siblingClasses: ReadonlySet<string>;
  /**
   * Names of the frame-1 children of the symbol linked to this file's class (design 21.1, D38).
   * A field of the class with one of these names is emitted with `declare`. Absent: the rule is off.
   */
  childNames?: ReadonlySet<string>;
  /** Injected parser (decision D4). */
  syntaxCheck: SyntaxCheck;
}

/** `startLine` and `endLine` are 1-based and inclusive. */
export interface LineSpan {
  startLine: number;
  endLine: number;
  kind: 'translated' | 'structural' | 'dropped' | 'comment' | 'unsupported';
}

export interface ClassInfo {
  name: string;
  /** As written in the source. */
  extendsName: string | null;
  /** Resolved through the import plan; null when the base has no source. */
  extendsQualified: string | null;
}

export interface TranslateResult {
  /** Name in the package declaration, '' for the unnamed package or no package. */
  packageName: string;
  /** LF line endings, one trailing newline, '' for blank input. */
  text: string;
  /** Sorted by (line, kind, message), UTF-16 code unit order. */
  diagnostics: Diagnostic[];
  /** Sorted by startLine. */
  spans: LineSpan[];
  /** Classes declared in the file (0 or 1 in practice). */
  classes: ClassInfo[];
  /** The generated import lines of 	ext: the Shim line first, then one per planned import. */
  importRecords: ImportRecord[];
  /** The file declares AS3 interfaces and all of them were emitted as a TypeScript interface and a token. */
  interfaceTranslated?: boolean;
}

/** One generated import line (design 14.1). */
export interface ImportRecord {
  /** 1-based line of the import in 	ext. */
  line: number;
  kind: 'shim' | 'class';
  names: Array<{ name: string; alias?: string }>;
  /** Qualified_Name of the imported class, for kind class. */
  target?: string;
}
