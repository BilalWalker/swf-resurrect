// Caught_Error reporting types and pure text helpers (Requirement 25, design 21.3). Core: no node module, clock or
// randomness, so the same file runs in the browser, in the Replay and in unit tests.

export interface CaughtError {
  /** Error_Site: 'constructor X', 'frame script X frame n', 'listener <type> on <target>'. */
  site: string;
  message: string;
  /** Unqualified AS3 class name when the site has one. */
  className: string | null;
}

export type ErrorSink = (e: CaughtError) => void;

const ESC = String.fromCharCode(27);
const COLOUR_CODES = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');

/** Error.message, else String(thrown). Never the stack; terminal colour codes removed. */
export function messageOf(thrown: unknown): string {
  let text: string;
  if (thrown instanceof Error) {
    text = thrown.message;
  } else {
    try {
      text = String(thrown);
    } catch {
      text = Object.prototype.toString.call(thrown);
    }
  }
  return text.replace(COLOUR_CODES, '');
}

export function constructorSite(className: string): string {
  return `constructor ${className}`;
}

export function frameScriptSite(owner: string, frame: number): string {
  return `frame script ${owner} frame ${frame}`;
}

export function listenerSite(type: string, target: string): string {
  return `listener ${type} on ${target}`;
}
