type TraceSink = (...args: unknown[]) => void;

const defaultSink: TraceSink = (...args) => {
  console.log(...args);
};

let sink: TraceSink = defaultSink;

export function trace(...args: unknown[]): void {
  sink(...args);
}

/** Replaces the trace output; null restores the console.log default. */
export function setTraceSink(fn: TraceSink | null): void {
  sink = fn ?? defaultSink;
}
