/** Type-only definitions shared by the pure Transpiler files. No imports, no runtime code. */

export type DiagnosticKind = 'unsupported-construct' | 'loose-type' | 'class-omitted';

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
  /** MovieClip instance members callable unqualified. */
  shimMembers: ReadonlySet<string>;
  /** Qualified_Name of the class this file declares (path-derived). */
  selfQualified: string;
  /** Qualified_Names of the other classes exported next to this file. */
  siblingClasses: ReadonlySet<string>;
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
