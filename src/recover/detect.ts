/**
 * Obfuscation verdict (robustness design D-B2, Requirements 14.2, 14.3, 14.5). Pure: counts in, verdict out.
 * The 20 % share and the floor of 5 invalid names are chosen, not measured against a population (Open_Item O2).
 */
import type { AbcNameScan } from "../facts/abcNames";

/** Share of invalid names at or above which a file is called obfuscated, and the floor on their number. */
export const OBFUSCATED_SHARE = 0.2;
export const OBFUSCATED_MIN_INVALID = 5;

/** The result recorded in the Outcome_File (`obfuscated`). `sourceSignals` stays null until a source scan exists. */
export interface ObfuscationVerdict {
  detected: boolean;
  namesScanned: number;
  invalidNames: number;
  sourceSignals: number | null;
}

/** True when the scan read every multiname table to its end, and invalid names are at least 20 % and at least 5. */
export function isObfuscated(scan: Pick<AbcNameScan, "namesScanned" | "invalidNames" | "complete">): boolean {
  return (
    scan.complete &&
    scan.namesScanned > 0 &&
    scan.invalidNames >= OBFUSCATED_MIN_INVALID &&
    scan.invalidNames / scan.namesScanned >= OBFUSCATED_SHARE
  );
}

export function obfuscationVerdict(scan: Pick<AbcNameScan, "namesScanned" | "invalidNames" | "complete">): ObfuscationVerdict {
  return {
    detected: isObfuscated(scan),
    namesScanned: scan.namesScanned,
    invalidNames: scan.invalidNames,
    sourceSignals: null,
  };
}
