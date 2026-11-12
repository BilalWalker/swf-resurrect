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
  /** Other classes exported next to this file. */
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
  extendsName: string | null;
}

export interface TranslateResult {
  /** LF line endings, one trailing newline, '' for blank input. */
  text: string;
  /** Sorted by (line, kind, message), UTF-16 code unit order. */
  diagnostics: Diagnostic[];
  /** Sorted by startLine. */
  spans: LineSpan[];
  /** Classes declared in the file (0 or 1 in practice). */
  classes: ClassInfo[];
}
