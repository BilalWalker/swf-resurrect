import { PipelineError } from '../pipeline/errors';

export abstract class TranslateError extends PipelineError {
  readonly stage = 'translate' as const;
}

export class ScriptsDirError extends TranslateError {
  readonly code = 'SCRIPTS_DIR';
  constructor(readonly path: string, detail: string) {
    super(`cannot read scripts directory ${path}: ${detail}`);
  }
}

export class DuplicateClassError extends TranslateError {
  readonly code = 'DUPLICATE_CLASS';
  constructor(readonly className: string, readonly paths: string[]) {
    super(`class ${className} is defined more than once: ${paths.join(', ')}`);
  }
}
