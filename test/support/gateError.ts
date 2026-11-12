import type { GateError } from '../../src/translate/typeCheckGate';

/** Builds a GateError with the defaults `syntactic: false` and `specifier: null`. */
export function gateError(partial: Partial<GateError> = {}): GateError {
  return {
    file: 'src/A.ts',
    line: 1,
    column: 1,
    code: 2322,
    message: 'bad',
    syntactic: false,
    specifier: null,
    ...partial,
  };
}
