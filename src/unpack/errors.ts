import { PipelineError } from '../pipeline/errors';
import { stripAnsi } from './ansi';

export abstract class UnpackError extends PipelineError {
  readonly stage = 'unpack' as const;
}

export class InvalidSwfError extends UnpackError {
  readonly code = 'INVALID_SWF';
  constructor(readonly path: string) {
    super(`${path} is not a valid SWF file`);
  }
}

export class FfdecNotFoundError extends UnpackError {
  readonly code = 'FFDEC_NOT_FOUND';
  constructor(readonly expectedPath: string) {
    super(`FFDec was not found at ${expectedPath}`);
  }
}

export class JavaNotFoundError extends UnpackError {
  readonly code = 'JAVA_NOT_FOUND';
  constructor() {
    super('Java 17+ required to run FFDec, but the java command was not found');
  }
}

export class FfdecExitError extends UnpackError {
  readonly code = 'FFDEC_EXIT';
  readonly stderrText: string;
  constructor(readonly exitCode: number, stderrText: string) {
    const clean = stripAnsi(stderrText);
    super(`FFDec exited with code ${exitCode}: ${clean}`);
    this.stderrText = clean;
  }
}

export class FfdecTimeoutError extends UnpackError {
  readonly code = 'FFDEC_TIMEOUT';
  constructor(readonly seconds: number = 60) {
    super(`FFDec exceeded the ${seconds} second limit and was stopped`);
  }
}

export class NotAs3Error extends UnpackError {
  readonly code = 'NOT_AS3';
  constructor() {
    super('This SWF does not use ActionScript 3; only AS3 is supported');
  }
}

export class MissingExportError extends UnpackError {
  readonly code = 'MISSING_EXPORT';
  constructor(readonly names: string[]) {
    super(`FFDec finished but these exports are missing: ${names.join(', ')}`);
  }
}

export class XmlVersionError extends UnpackError {
  readonly code = 'XML_VERSION';
  constructor(readonly found: string, readonly supported: string) {
    super(`Unsupported FFDec XML export version ${found}; supported version is ${supported}`);
  }
}

export class MissingHeaderValueError extends UnpackError {
  readonly code = 'MISSING_HEADER_VALUE';
  constructor(readonly names: string[]) {
    super(`The structure dump root element lacks readable values: ${names.join(', ')}`);
  }
}
