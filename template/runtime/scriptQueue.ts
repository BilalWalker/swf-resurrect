import { frameScriptSite, messageOf } from './errorReport';
import { reportCaughtError } from '../shim/errorSink';

/** The part of a clip the queue needs: a frame-script table keyed by 1-based frame number. */
export interface ScriptHost {
  readonly frameScripts: ReadonlyMap<number, () => void>;
  /** Owner text of the Error_Site: the class name, or `symbol <id>` for a plain clip. Absent: `MovieClip`. */
  readonly _scriptOwner?: () => string;
}

interface PendingScript {
  host: ScriptHost;
  frame: number;
}

/** FIFO queue of frame scripts. One per Player. */
export class ScriptQueue {
  private readonly pending: PendingScript[] = [];
  private draining = false;

  enqueue(host: ScriptHost, frame: number): void {
    this.pending.push({ host, frame });
  }

  /**
   * Runs queued scripts in order. A call made while a script is running
   * returns at once; the outer drain picks up anything enqueued meanwhile.
   * The script is looked up when its entry is dequeued.
   */
  drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      let entry = this.pending.shift();
      while (entry !== undefined) {
        const fn = entry.host.frameScripts.get(entry.frame);
        if (fn) {
          // A throwing script is abandoned alone (Requirement 25.1): report it and run the next entry.
          try {
            fn();
          } catch (thrown) {
            const owner = entry.host._scriptOwner?.() ?? 'MovieClip';
            reportCaughtError({
              site: frameScriptSite(owner, entry.frame),
              message: messageOf(thrown),
              className: null,
            });
          }
        }
        entry = this.pending.shift();
      }
    } finally {
      this.draining = false;
    }
  }

  get size(): number {
    return this.pending.length;
  }
}
