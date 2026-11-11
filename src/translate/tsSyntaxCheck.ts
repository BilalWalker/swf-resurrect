import ts from 'typescript-js';
import type { SyntaxCheck } from './types';

/**
 * Parse check for translated TypeScript text. Wraps `ts.transpileModule`
 * (in process, no file system) and returns syntax errors only.
 */
export const tsSyntaxCheck: SyntaxCheck = (tsText) => {
  const out = ts.transpileModule(tsText, {
    fileName: 'check.ts',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
  });
  const errors: { line: number; message: string }[] = [];
  for (const d of out.diagnostics ?? []) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;
    const line =
      d.file !== undefined && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : 1;
    errors.push({ line, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') });
  }
  return errors;
};
