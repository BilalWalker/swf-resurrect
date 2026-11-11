export type PipelineStage = 'unpack' | 'convert' | 'translate' | 'emit' | 'pipeline';

/** Base class for every error the pipeline reports with a stage and stable code. */
export abstract class PipelineError extends Error {
  abstract readonly stage: PipelineStage;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
