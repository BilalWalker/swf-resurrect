/** The part of a clip the queue needs: a frame-script table keyed by 1-based frame number. */
export interface ScriptHost {
  readonly frameScripts: ReadonlyMap<number, () => void>;
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
        if (fn) fn();
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
