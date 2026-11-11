import { PipelineError } from '../pipeline/errors';

export abstract class ConvertError extends PipelineError {
  readonly stage = 'convert' as const;
}

export class UnknownSymbolError extends ConvertError {
  readonly code = 'UNKNOWN_SYMBOL';
  constructor(
    readonly symbolId: number,
    readonly spriteId: number,
    readonly frame: number,
    readonly depth: number,
  ) {
    super(`Unknown symbol ${symbolId} placed in sprite ${spriteId}, frame ${frame}, depth ${depth}`);
  }
}

export class ShapeExportError extends ConvertError {
  readonly code = 'SHAPE_EXPORT';
  constructor(readonly symbolId: number, readonly reason: 'missing' | 'empty') {
    super(`Shape ${symbolId} has no usable SVG export (${reason})`);
  }
}

export class MalformedSvgError extends ConvertError {
  readonly code = 'MALFORMED_SVG';
  constructor(readonly fileName: string) {
    super(`SVG file ${fileName} is not well-formed XML`);
  }
}

export class MalformedFrameDataError extends ConvertError {
  readonly code = 'MALFORMED_FRAME_DATA';
  constructor(
    readonly spriteId: number | 'root',
    readonly frame: number | null,
    readonly item: string,
  ) {
    super(`Malformed frame data in sprite ${spriteId}, frame ${frame ?? 'n/a'}: ${item}`);
  }
}

export class SymbolCycleError extends ConvertError {
  readonly code = 'SYMBOL_CYCLE';
  constructor(readonly path: number[]) {
    super(`Sprite places itself: ${path.join(' -> ')}`);
  }
}
