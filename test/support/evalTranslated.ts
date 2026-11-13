// Runs translated TypeScript text in-process for tests: a real transpile (ES2022 with define semantics for
// class fields, as Vite uses) and a CommonJS evaluation with a module table for the imports.

import ts from 'typescript-js';

export function evalTranslated(tsText: string, modules: Record<string, unknown> = {}): Record<string, any> {
  const js = ts.transpileModule(tsText, {
    fileName: 'probe.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      useDefineForClassFields: true,
    },
  }).outputText;
  const exports: Record<string, any> = {};
  const req = (spec: string): unknown => {
    if (!(spec in modules)) throw new Error(`evalTranslated: no module for ${spec}`);
    return modules[spec];
  };
  new Function('exports', 'require', js)(exports, req);
  return exports;
}
