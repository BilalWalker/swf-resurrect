import { PipelineError } from '../pipeline/errors';

export abstract class EmitError extends PipelineError {
  readonly stage = 'emit' as const;
}

export type ForceRefusalReason =
  | 'filesystem-root'
  | 'home-directory'
  | 'current-directory'
  | 'ancestor-of-current-directory'
  | 'contains-input-swf';

export class UnsafeForceTargetError extends EmitError {
  readonly code = 'UNSAFE_FORCE_TARGET';
  constructor(
    readonly outputDir: string,
    readonly reason: ForceRefusalReason,
  ) {
    super(`Refusing to use --force on ${outputDir}: ${reason}. Nothing was deleted.`);
  }
}

export class OutputDirNotEmptyError extends EmitError {
  readonly code = 'OUTPUT_DIR_NOT_EMPTY';
  constructor(readonly outputDir: string) {
    super(`Output directory is not empty: ${outputDir}. Use --force to replace its contents.`);
  }
}
