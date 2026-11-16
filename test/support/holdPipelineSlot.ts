// Holds one 'pipeline' slot for the whole enclosing describe, for e2e files that start Chromium in this process
// (launchChromium or renderFrames), so every browser in the suite counts against PIPELINE_SLOTS (task 29.1).
// Call it once, first inside the describe, and never in a file whose tests also call withSlot or sharedPipelineRun:
// the slot is not re-entrant, so a nested take would hold two slots of the same process.
// The hooks' timeout covers the queueing only; the file's own hooks and tests keep their limits.
import { afterAll, beforeAll } from 'vitest';
import { acquireSlot, PIPELINE_SLOTS, releaseSlot } from './slots';

const QUEUE_MS = 20 * 60_000;

export function holdPipelineSlot(): void {
  let slot: string | null = null;
  beforeAll(async () => {
    slot = await acquireSlot('pipeline', PIPELINE_SLOTS);
  }, QUEUE_MS);
  afterAll(async () => {
    if (slot !== null) await releaseSlot(slot);
    slot = null;
  });
}