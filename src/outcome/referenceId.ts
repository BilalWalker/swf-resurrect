/**
 * Reference_Id helpers (robustness spec, D-A6). Pure: no node:* import. The sha256 hash is computed
 * at the edge (src/pipeline/pipeline.ts) over the string built here.
 */

/** The text that is hashed: `inputSha256 \n stage \n errorName \n errorMessage`. */
export function referenceIdInput(inputSha256: string, stage: string, errorName: string, errorMessage: string): string {
  return `${inputSha256}\n${stage}\n${errorName}\n${errorMessage}`;
}

/** First 8 hex digits of a sha256 hex digest, lower case. */
export function referenceIdFromDigest(digestHex: string): string {
  return digestHex.slice(0, 8).toLowerCase();
}

/** The `failed` reason that carries the id into the Outcome_File and the Outcome_Line. */
export function failedReason(base: string, referenceId: string): string {
  return `${base} (reference ${referenceId})`;
}
